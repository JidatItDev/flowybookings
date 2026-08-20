-- Week 2 billing foundation: pending plan columns, owner billing guard,
-- booking limit trigger, subscription_status SSOT, payment idempotency index.

-- ── 1. Pending plan columns ─────────────────────────────────────────────────

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS pending_plan public.subscription_plan,
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamptz;

COMMENT ON COLUMN public.shops.pending_plan IS 'Scheduled plan change (typically downgrade at renewal)';
COMMENT ON COLUMN public.shops.pending_plan_effective_at IS 'When pending_plan becomes active';

-- ── 2. Backfill subscription_status from onboarding ─────────────────────────

UPDATE public.shops
SET subscription_status = COALESCE(
  NULLIF(onboarding->>'subscription_status', '')::text,
  CASE WHEN plan IN ('starter','pro','premium') AND plan_expires_at > now() THEN 'active' ELSE 'none' END
)
WHERE subscription_status IS NULL OR subscription_status = '';

-- ── 3. Allow 'none' in subscription_status validator ────────────────────────

CREATE OR REPLACE FUNCTION public.validate_shop_subscription_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_status NOT IN ('active','trial','expired','cancelled','paused','payment_failed','none') THEN
    RAISE EXCEPTION 'invalid subscription_status: %', NEW.subscription_status;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Owner billing column guard trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_owner_billing_column_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF public.is_shop_owner(auth.uid(), OLD.id) THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at
       OR NEW.plan_billing_cycle IS DISTINCT FROM OLD.plan_billing_cycle
       OR NEW.pending_plan IS DISTINCT FROM OLD.pending_plan
       OR NEW.pending_plan_effective_at IS DISTINCT FROM OLD.pending_plan_effective_at
       OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
    THEN
      RAISE EXCEPTION 'billing_columns_owner_update_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_owner_billing_update_trg ON public.shops;
CREATE TRIGGER prevent_owner_billing_update_trg
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_billing_column_update();

-- ── 5. Bookings over plan limit trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_bookings_over_plan_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT g.allowed INTO v_allowed
    FROM public.get_shop_feature_access(NEW.shop_id, 'max_bookings_per_month') AS g;

  IF v_allowed = false THEN
    RAISE EXCEPTION 'bookings_over_plan_limit'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_bookings_over_plan_limit_trg ON public.bookings;
CREATE TRIGGER prevent_bookings_over_plan_limit_trg
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_bookings_over_plan_limit();

-- ── 6. shop_can_accept_bookings: use subscription_status column ─────────────

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
  SELECT plan, plan_expires_at, subscription_status, onboarding
    INTO v_plan, v_expires, v_sub_status, v_onboarding
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
  v_failed_at := NULLIF(v_onboarding->>'payment_failed_at', '')::timestamptz;

  IF v_sub_status = 'payment_failed' AND v_failed_at IS NOT NULL THEN
    -- Binnen 7 dagen na payment_failed: nog toegestaan (grace)
    -- Daarna: blokkeren tot betaling weer slaagt
    RETURN v_failed_at > (now() - interval '7 days');
  END IF;

  RETURN true;
END;
$$;

-- ── 7. Payment idempotency unique index ─────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_uniq
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
