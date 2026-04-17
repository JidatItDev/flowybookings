-- Allow anonymous booking flow to upsert customers for active shops
CREATE POLICY "customers_public_insert"
ON public.customers FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.shops WHERE id = customers.shop_id AND status = 'active')
);

-- Allow anonymous lookup by email within active shops (for de-dup)
CREATE POLICY "customers_public_select_by_shop"
ON public.customers FOR SELECT
TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM public.shops WHERE id = customers.shop_id AND status = 'active')
);

-- Allow anonymous payment stub creation tied to a public booking
CREATE POLICY "payments_public_insert"
ON public.payments FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.shops WHERE id = payments.shop_id AND status = 'active')
);