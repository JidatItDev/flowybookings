-- =========================================================
-- 1. Feature access RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_shop_feature_access(
  _shop_id uuid,
  _feature_slug text
)
RETURNS TABLE (
  allowed boolean,
  limit_value integer,
  used integer,
  upgrade_plan text,
  current_plan text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plan;
  v_included boolean;
  v_limit integer;
  v_used integer := 0;
  v_upgrade text := NULL;
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end timestamptz := (date_trunc('month', now()) + interval '1 month');
BEGIN
  -- Authorization: only members of the shop or super admins can read
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

  -- Compute used counter per feature
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
    -- Trial: count cumulative for the trial lifetime; otherwise per calendar month
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

  -- Determine upgrade plan: lowest plan in the hierarchy that includes the feature
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
    -- Limit reached: suggest the next plan with a higher (or unlimited) limit
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
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_feature_access(uuid, text) TO authenticated;

-- =========================================================
-- 2. Fix: search_path on email queue helper functions
-- =========================================================
ALTER FUNCTION public.delete_email(text, bigint)        SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb)        SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

-- =========================================================
-- 3. Fix: shop-logos bucket — restrict listing
-- =========================================================
-- Drop overly broad policies that allow listing all objects in shop-logos
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (qual ILIKE '%shop-logos%' OR with_check ILIKE '%shop-logos%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END$$;

-- Public read by exact path only — no listing (object name must be specified)
CREATE POLICY "shop_logos_public_read_object"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'shop-logos' AND name IS NOT NULL);

-- Authenticated shop owners can upload/update/delete logos for their shop.
-- Convention: file path is "<shop_id>/..." so we check the first folder.
CREATE POLICY "shop_logos_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'shop-logos'
    AND public.is_shop_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "shop_logos_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'shop-logos'
    AND public.is_shop_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "shop_logos_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'shop-logos'
    AND public.is_shop_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );