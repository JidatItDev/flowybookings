
-- Mollie Connect (and future providers) per-shop configuration
CREATE TABLE IF NOT EXISTS public.shop_payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mollie',
  provider_account_id text,
  connection_status text NOT NULL DEFAULT 'not_connected', -- not_connected | pending | connected | disconnected | error
  onboarding_status text NOT NULL DEFAULT 'not_started',   -- not_started | in_review | completed | rejected
  application_fee_enabled boolean NOT NULL DEFAULT true,
  application_fee_percent numeric(5,2) NOT NULL DEFAULT 2.00,
  payment_methods_enabled jsonb NOT NULL DEFAULT '["ideal","creditcard","bancontact"]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_shop_payment_providers_shop ON public.shop_payment_providers(shop_id);

ALTER TABLE public.shop_payment_providers ENABLE ROW LEVEL SECURITY;

-- Shop owners can view & manage their own provider rows
CREATE POLICY "shop_payment_providers_owner_select" ON public.shop_payment_providers
FOR SELECT TO authenticated
USING (public.has_shop_access(auth.uid(), shop_id));

CREATE POLICY "shop_payment_providers_owner_insert" ON public.shop_payment_providers
FOR INSERT TO authenticated
WITH CHECK (public.is_shop_owner(auth.uid(), shop_id));

CREATE POLICY "shop_payment_providers_owner_update" ON public.shop_payment_providers
FOR UPDATE TO authenticated
USING (public.is_shop_owner(auth.uid(), shop_id))
WITH CHECK (public.is_shop_owner(auth.uid(), shop_id));

CREATE POLICY "shop_payment_providers_owner_delete" ON public.shop_payment_providers
FOR DELETE TO authenticated
USING (public.is_shop_owner(auth.uid(), shop_id));

-- Super admins already covered by has_shop_access/is_shop_owner returning true for super_admin

-- Auto-update updated_at
CREATE TRIGGER trg_shop_payment_providers_updated_at
BEFORE UPDATE ON public.shop_payment_providers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
