-- Block bookings and gated features once a subscription has fully lapsed
-- (subscription_status = 'none' — set by billing-expiry.ts's expiry sweep
-- after a cancelled/unpaid paid plan's access window ends). Previously
-- both functions ignored this status entirely and kept gating purely on
-- shops.plan, so a lapsed shop kept full, free, indefinite access to its
-- last paid plan's features (there is no free tier in this product —
-- Starter is a paid plan). No grace period here, unlike payment_failed:
-- by the time a shop reaches 'none' the grace period already ran out, or
-- the owner had until plan_expires_at to reactivate.

CREATE OR REPLACE FUNCTION public.shop_can_accept_bookings(_shop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plan;
  v_expires timestamptz;
  v_failed_at timestamptz;
  v_sub_status text;
BEGIN
  SELECT plan, plan_expires_at, subscription_status, payment_failed_at
    INTO v_plan, v_expires, v_sub_status, v_failed_at
    FROM public.shops
   WHERE id = _shop_id;

  IF v_plan IS NULL THEN
    RETURN false;
  END IF;

  IF v_plan = 'trial' THEN
    RETURN v_expires IS NULL OR v_expires > now();
  END IF;

  IF v_sub_status = 'none' THEN
    RETURN false;
  END IF;

  IF v_sub_status = 'payment_failed' AND v_failed_at IS NOT NULL THEN
    RETURN v_failed_at > (now() - interval '7 days');
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shop_feature_access(_shop_id uuid, _feature_slug text)
RETURNS TABLE(allowed boolean, limit_value integer, used integer, upgrade_plan text, current_plan text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan public.subscription_plan;
  v_sub_status text;
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

  SELECT plan, subscription_status INTO v_plan, v_sub_status FROM public.shops WHERE id = _shop_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'shop not found';
  END IF;

  IF v_plan <> 'trial' AND v_sub_status = 'none' THEN
    RETURN QUERY SELECT false, NULL::integer, 0, NULL::text, v_plan::text;
    RETURN;
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
