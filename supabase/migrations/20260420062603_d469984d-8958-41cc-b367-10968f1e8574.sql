-- 1) plan_pricing
CREATE TABLE public.plan_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name public.subscription_plan NOT NULL UNIQUE,
  monthly_price_cents integer NOT NULL DEFAULT 0,
  platform_fee_bps integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_pricing_public_read ON public.plan_pricing
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY plan_pricing_admin_write ON public.plan_pricing
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_plan_pricing_updated_at
  BEFORE UPDATE ON public.plan_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.plan_pricing (plan_name, monthly_price_cents, platform_fee_bps) VALUES
  ('trial',   0,    0),
  ('starter', 1900, 150),
  ('pro',     4900, 100),
  ('premium', 9900, 50);

-- 2) shop_feature_overrides
CREATE TABLE public.shop_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  feature_slug text NOT NULL,
  is_included boolean NOT NULL DEFAULT true,
  limit_value integer,
  expires_at timestamptz,
  reason text,
  granted_by uuid,
  granted_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, feature_slug)
);

CREATE INDEX idx_shop_feature_overrides_shop_feature
  ON public.shop_feature_overrides(shop_id, feature_slug);

ALTER TABLE public.shop_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY overrides_admin_all ON public.shop_feature_overrides
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY overrides_owner_select ON public.shop_feature_overrides
  FOR SELECT TO authenticated
  USING (public.has_shop_access(auth.uid(), shop_id));

CREATE TRIGGER trg_shop_feature_overrides_updated_at
  BEFORE UPDATE ON public.shop_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Update get_shop_feature_access to honor active overrides
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
     WHERE shop_id = _shop_id AND is_active = true;
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