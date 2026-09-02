-- supabase/migrations/20260902121500_public_shop_mollie_connected.sql
-- Narrow public-safe boolean so the anon booking client can gray out
-- deposit-requiring services without ever seeing shop_payment_providers'
-- encrypted token columns.

CREATE OR REPLACE FUNCTION public.public_shop_mollie_connected(_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_payment_providers
    WHERE shop_id = _shop_id
      AND provider = 'mollie'
      AND connection_status = 'connected'
  );
$$;

GRANT EXECUTE ON FUNCTION public.public_shop_mollie_connected(uuid) TO anon, authenticated;
