ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS policy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS policy_version text;

CREATE INDEX IF NOT EXISTS idx_shops_policy_accepted_at ON public.shops (policy_accepted_at);
