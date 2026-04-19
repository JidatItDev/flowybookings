ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_billing_cycle text;

CREATE INDEX IF NOT EXISTS idx_payments_provider_shop
  ON public.payments(provider, shop_id);

CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id
  ON public.payments(provider_payment_id);