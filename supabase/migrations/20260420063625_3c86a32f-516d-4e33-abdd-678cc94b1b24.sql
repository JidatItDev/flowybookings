-- 1) Trigger: nieuwe shops krijgen automatisch 14 dagen trial
CREATE OR REPLACE FUNCTION public.handle_new_shop_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan = 'trial' AND NEW.plan_expires_at IS NULL THEN
    NEW.plan_expires_at := now() + interval '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_trial_expiry_on_insert ON public.shops;
CREATE TRIGGER set_trial_expiry_on_insert
  BEFORE INSERT ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_shop_trial();

-- 2) Backfill: bestaande trial-shops zonder expiry krijgen 14 dagen vanaf nu
UPDATE public.shops
SET plan_expires_at = now() + interval '14 days'
WHERE plan = 'trial'
  AND plan_expires_at IS NULL;

-- 3) Helper: kan deze shop nu boekingen accepteren?
--    - trial: alleen als plan_expires_at > now()
--    - paid: altijd, tenzij payment_failed_at gezet is en > 7 dagen geleden
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
  v_onboarding jsonb;
  v_failed_at timestamptz;
  v_sub_status text;
BEGIN
  SELECT plan, plan_expires_at, onboarding
    INTO v_plan, v_expires, v_onboarding
    FROM public.shops
   WHERE id = _shop_id;

  IF v_plan IS NULL THEN
    RETURN false;
  END IF;

  -- Trial: blokkeren als verlopen
  IF v_plan = 'trial' THEN
    RETURN v_expires IS NULL OR v_expires > now();
  END IF;

  -- Paid plans: check payment_failed grace period
  v_sub_status := v_onboarding->>'subscription_status';
  v_failed_at := NULLIF(v_onboarding->>'payment_failed_at', '')::timestamptz;

  IF v_sub_status = 'payment_failed' AND v_failed_at IS NOT NULL THEN
    -- Binnen 7 dagen na payment_failed: nog toegestaan (grace)
    -- Daarna: blokkeren tot betaling weer slaagt
    RETURN v_failed_at > (now() - interval '7 days');
  END IF;

  RETURN true;
END;
$$;

-- 4) RLS policy op bookings INSERT — vervangt bestaande policies met added check
DROP POLICY IF EXISTS bookings_public_insert ON public.bookings;
DROP POLICY IF EXISTS bookings_block_when_inactive ON public.bookings;

-- Publiek inserten via /book mag alleen op active shops EN als shop boekingen mag accepteren
CREATE POLICY bookings_public_insert ON public.bookings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shops
      WHERE shops.id = bookings.shop_id
        AND shops.status = 'active'
    )
    AND public.shop_can_accept_bookings(bookings.shop_id)
  );

-- Owner/staff kunnen vanuit dashboard inserten met dezelfde check
DROP POLICY IF EXISTS bookings_shop_insert ON public.bookings;
CREATE POLICY bookings_shop_insert ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_shop_access(auth.uid(), shop_id)
    AND public.shop_can_accept_bookings(shop_id)
  );