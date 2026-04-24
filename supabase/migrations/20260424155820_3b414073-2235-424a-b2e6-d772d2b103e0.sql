-- 1) Nieuwe vaste fee kolom op plan_pricing
ALTER TABLE public.plan_pricing
  ADD COLUMN IF NOT EXISTS booking_fee_cents integer NOT NULL DEFAULT 0;

-- 2) Zet de waarden per plan (idempotent via UPSERT-achtige update)
UPDATE public.plan_pricing SET booking_fee_cents = 0   WHERE plan_name = 'trial';
UPDATE public.plan_pricing SET booking_fee_cents = 50  WHERE plan_name = 'starter';
UPDATE public.plan_pricing SET booking_fee_cents = 30  WHERE plan_name = 'pro';
UPDATE public.plan_pricing SET booking_fee_cents = 0   WHERE plan_name = 'premium';

-- Insert ontbrekende rijen (voor verse omgevingen)
INSERT INTO public.plan_pricing (plan_name, monthly_price_cents, currency, platform_fee_bps, booking_fee_cents)
VALUES
  ('trial',   0,    'EUR', 0,   0),
  ('starter', 1900, 'EUR', 150, 50),
  ('pro',     4900, 'EUR', 100, 30),
  ('premium', 9900, 'EUR', 50,  0)
ON CONFLICT (plan_name) DO NOTHING;

-- 3) Per-shop override kolom (in cents). NULL = gebruik plan-default.
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS booking_fee_cents_override integer NULL;