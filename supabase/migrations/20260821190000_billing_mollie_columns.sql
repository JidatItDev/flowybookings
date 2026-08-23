-- Shop-level Mollie pointers as columns. No JSON backfill (test data will be wiped).

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS mollie_customer_id text,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;

COMMENT ON COLUMN public.shops.mollie_customer_id IS 'Platform Mollie customer id (cst_…)';
COMMENT ON COLUMN public.shops.mollie_subscription_id IS 'Platform Mollie subscription id (sub_…)';
COMMENT ON COLUMN public.shops.payment_failed_at IS 'First recurring collection failure; 7-day booking grace starts here';

CREATE UNIQUE INDEX IF NOT EXISTS shops_mollie_customer_id_uniq
  ON public.shops (mollie_customer_id)
  WHERE mollie_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shops_mollie_subscription_id_uniq
  ON public.shops (mollie_subscription_id)
  WHERE mollie_subscription_id IS NOT NULL;

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
       OR NEW.next_billing_at IS DISTINCT FROM OLD.next_billing_at
       OR NEW.mollie_customer_id IS DISTINCT FROM OLD.mollie_customer_id
       OR NEW.mollie_subscription_id IS DISTINCT FROM OLD.mollie_subscription_id
       OR NEW.payment_failed_at IS DISTINCT FROM OLD.payment_failed_at
    THEN
      RAISE EXCEPTION 'billing_columns_owner_update_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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

  IF v_sub_status = 'payment_failed' AND v_failed_at IS NOT NULL THEN
    RETURN v_failed_at > (now() - interval '7 days');
  END IF;

  RETURN true;
END;
$$;
