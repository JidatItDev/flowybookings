ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_shop_import_source
  ON public.customers (shop_id, import_source)
  WHERE import_source IS NOT NULL;