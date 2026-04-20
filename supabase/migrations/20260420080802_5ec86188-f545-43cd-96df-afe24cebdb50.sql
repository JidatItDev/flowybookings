
-- Subscription management fields on shops
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS platform_fee_bps_override integer,
  ADD COLUMN IF NOT EXISTS next_billing_at timestamptz,
  ADD COLUMN IF NOT EXISTS mollie_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_notes text,
  ADD COLUMN IF NOT EXISTS category text;

-- Validation trigger (replaces a CHECK constraint to keep flexibility)
CREATE OR REPLACE FUNCTION public.validate_shop_subscription_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_status NOT IN ('active','trial','expired','cancelled','paused','payment_failed') THEN
    RAISE EXCEPTION 'invalid subscription_status: %', NEW.subscription_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_shop_subscription_status_trg ON public.shops;
CREATE TRIGGER validate_shop_subscription_status_trg
  BEFORE INSERT OR UPDATE OF subscription_status ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.validate_shop_subscription_status();

-- Profiles: admin last-seen for the activity bell + last login tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_last_seen_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS shops_subscription_status_idx ON public.shops(subscription_status);
CREATE INDEX IF NOT EXISTS profiles_last_login_at_idx ON public.profiles(last_login_at DESC);

-- Allow admins to read all profiles (already covered by existing policy via is_super_admin)
-- Allow self update of last_login_at (already covered by profiles_update_self)

-- Update the welcome trigger to also seed last_login_at on signup so the
-- "Last login" column shows something for brand-new accounts.
-- (No-op if function does not exist yet.)
