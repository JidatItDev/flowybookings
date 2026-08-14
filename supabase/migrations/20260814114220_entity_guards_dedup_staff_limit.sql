-- Delete guard (services/staff/customers), customer email uniqueness,
-- public rematch contact refresh, and insert-time max_staff enforcement.

-- ── 1. Open future bookings helper + delete triggers ─────────────────────────

CREATE OR REPLACE FUNCTION public.entity_has_open_future_bookings(
  _kind text,
  _id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.starts_at >= now()
      AND b.status NOT IN ('cancelled', 'completed')
      AND (
        (_kind = 'service'  AND b.service_id  = _id) OR
        (_kind = 'staff'    AND b.staff_id    = _id) OR
        (_kind = 'customer' AND b.customer_id = _id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_delete_if_open_future_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
BEGIN
  IF public.entity_has_open_future_bookings(v_kind, OLD.id) THEN
    RAISE EXCEPTION 'ENTITY_IN_USE: cannot delete % with upcoming bookings', v_kind
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_delete_service_if_in_use ON public.services;
CREATE TRIGGER prevent_delete_service_if_in_use
  BEFORE DELETE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_if_open_future_bookings('service');

DROP TRIGGER IF EXISTS prevent_delete_staff_if_in_use ON public.staff;
CREATE TRIGGER prevent_delete_staff_if_in_use
  BEFORE DELETE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_if_open_future_bookings('staff');

DROP TRIGGER IF EXISTS prevent_delete_customer_if_in_use ON public.customers;
CREATE TRIGGER prevent_delete_customer_if_in_use
  BEFORE DELETE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_if_open_future_bookings('customer');

CREATE INDEX IF NOT EXISTS idx_bookings_open_future_service
  ON public.bookings (service_id, starts_at)
  WHERE status NOT IN ('cancelled', 'completed');

CREATE INDEX IF NOT EXISTS idx_bookings_open_future_staff
  ON public.bookings (staff_id, starts_at)
  WHERE status NOT IN ('cancelled', 'completed');

CREATE INDEX IF NOT EXISTS idx_bookings_open_future_customer
  ON public.bookings (customer_id, starts_at)
  WHERE status NOT IN ('cancelled', 'completed');

GRANT EXECUTE ON FUNCTION public.entity_has_open_future_bookings(text, uuid) TO authenticated;

-- ── 2. Unique email per shop (null/blank emails remain allowed) ──────────────

CREATE UNIQUE INDEX IF NOT EXISTS customers_shop_lower_email_uidx
  ON public.customers (shop_id, (lower(trim(email))))
  WHERE email IS NOT NULL AND length(trim(email)) > 0;

-- ── 3. Public rematch: refresh name/phone when they actually differ ──────────

CREATE OR REPLACE FUNCTION public.refresh_public_customer_contact(
  _id uuid,
  _shop_id uuid,
  _full_name text,
  _phone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := nullif(trim(coalesce(_full_name, '')), '');
  v_phone text := nullif(trim(coalesce(_phone, '')), '');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id = _shop_id AND s.status = 'active'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.customers c
  SET
    full_name = CASE
      WHEN v_name IS NOT NULL AND trim(c.full_name) IS DISTINCT FROM v_name THEN v_name
      ELSE c.full_name
    END,
    phone = CASE
      WHEN v_phone IS NOT NULL AND c.phone IS DISTINCT FROM v_phone THEN v_phone
      ELSE c.phone
    END
  WHERE c.id = _id
    AND c.shop_id = _shop_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_public_customer_contact(uuid, uuid, text, text) TO anon, authenticated;

-- ── 4. max_staff: count all staff rows (not active-only) ─────────────────────

CREATE OR REPLACE FUNCTION public.get_shop_feature_access(_shop_id uuid, _feature_slug text)
RETURNS TABLE(allowed boolean, limit_value integer, used integer, upgrade_plan text, current_plan text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan public.subscription_plan;
  v_included boolean;
  v_limit integer;
  v_used integer := 0;
  v_upgrade text := NULL;
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end timestamptz := (date_trunc('month', now()) + interval '1 month');
  v_override_included boolean;
  v_override_limit integer;
  v_has_override boolean := false;
BEGIN
  IF NOT public.has_shop_access(auth.uid(), _shop_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT plan INTO v_plan FROM public.shops WHERE id = _shop_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'shop not found';
  END IF;

  SELECT pf.is_included, pf.limit_value
    INTO v_included, v_limit
    FROM public.plan_features pf
   WHERE pf.plan_name = v_plan AND pf.feature_slug = _feature_slug;

  SELECT o.is_included, o.limit_value, true
    INTO v_override_included, v_override_limit, v_has_override
    FROM public.shop_feature_overrides o
   WHERE o.shop_id = _shop_id
     AND o.feature_slug = _feature_slug
     AND (o.expires_at IS NULL OR o.expires_at > now())
   LIMIT 1;

  IF v_has_override THEN
    v_included := v_override_included;
    v_limit := v_override_limit;
  END IF;

  IF _feature_slug = 'sms_reminders' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.sms_send_log
     WHERE shop_id = _shop_id
       AND status NOT IN ('skipped_no_credits', 'failed')
       AND created_at >= v_month_start
       AND created_at <  v_month_end;
  ELSIF _feature_slug = 'marketing_emails' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.email_send_log
     WHERE template_name = 'marketing'
       AND created_at >= v_month_start
       AND created_at <  v_month_end
       AND (metadata->>'shop_id') = _shop_id::text;
  ELSIF _feature_slug = 'max_bookings_per_month' THEN
    IF v_plan = 'trial' THEN
      SELECT COUNT(*)::int INTO v_used
        FROM public.bookings
       WHERE shop_id = _shop_id;
    ELSE
      SELECT COUNT(*)::int INTO v_used
        FROM public.bookings
       WHERE shop_id = _shop_id
         AND created_at >= v_month_start
         AND created_at <  v_month_end;
    END IF;
  ELSIF _feature_slug = 'max_staff' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.staff
     WHERE shop_id = _shop_id;
  ELSE
    v_used := 0;
  END IF;

  IF COALESCE(v_included, false) = false THEN
    SELECT pf.plan_name::text INTO v_upgrade
      FROM public.plan_features pf
     WHERE pf.feature_slug = _feature_slug
       AND pf.is_included = true
     ORDER BY CASE pf.plan_name
                WHEN 'trial'   THEN 1
                WHEN 'starter' THEN 2
                WHEN 'pro'     THEN 3
                WHEN 'premium' THEN 4
              END
     LIMIT 1;
  ELSIF v_limit IS NOT NULL AND v_used >= v_limit THEN
    SELECT pf.plan_name::text INTO v_upgrade
      FROM public.plan_features pf
     WHERE pf.feature_slug = _feature_slug
       AND pf.is_included = true
       AND (pf.limit_value IS NULL OR pf.limit_value > v_limit)
       AND CASE pf.plan_name
             WHEN 'trial'   THEN 1
             WHEN 'starter' THEN 2
             WHEN 'pro'     THEN 3
             WHEN 'premium' THEN 4
           END > CASE v_plan
             WHEN 'trial'   THEN 1
             WHEN 'starter' THEN 2
             WHEN 'pro'     THEN 3
             WHEN 'premium' THEN 4
           END
     ORDER BY CASE pf.plan_name
                WHEN 'trial'   THEN 1
                WHEN 'starter' THEN 2
                WHEN 'pro'     THEN 3
                WHEN 'premium' THEN 4
              END
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_included, false)
      AND (v_limit IS NULL OR v_used < v_limit) AS allowed,
    v_limit,
    v_used,
    v_upgrade,
    v_plan::text;
END;
$function$;

-- ── 5. Insert-time max_staff (authenticated only; service_role/seed bypass) ──

CREATE OR REPLACE FUNCTION public.prevent_staff_over_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plan;
  v_included boolean;
  v_limit integer;
  v_used integer;
  v_override_included boolean;
  v_override_limit integer;
  v_has_override boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO v_plan FROM public.shops WHERE id = NEW.shop_id;
  IF v_plan IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pf.is_included, pf.limit_value
    INTO v_included, v_limit
    FROM public.plan_features pf
   WHERE pf.plan_name = v_plan AND pf.feature_slug = 'max_staff';

  SELECT o.is_included, o.limit_value, true
    INTO v_override_included, v_override_limit, v_has_override
    FROM public.shop_feature_overrides o
   WHERE o.shop_id = NEW.shop_id
     AND o.feature_slug = 'max_staff'
     AND (o.expires_at IS NULL OR o.expires_at > now())
   LIMIT 1;

  IF v_has_override THEN
    v_included := v_override_included;
    v_limit := v_override_limit;
  END IF;

  SELECT COUNT(*)::int INTO v_used
    FROM public.staff
   WHERE shop_id = NEW.shop_id;

  IF COALESCE(v_included, false) = false THEN
    RAISE EXCEPTION 'STAFF_PLAN_LIMIT: max_staff is not included in this plan'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_limit IS NOT NULL AND v_used >= v_limit THEN
    RAISE EXCEPTION 'STAFF_PLAN_LIMIT: shop is at max_staff (%)', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_staff_over_plan_limit_trg ON public.staff;
CREATE TRIGGER prevent_staff_over_plan_limit_trg
  BEFORE INSERT ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_staff_over_plan_limit();
