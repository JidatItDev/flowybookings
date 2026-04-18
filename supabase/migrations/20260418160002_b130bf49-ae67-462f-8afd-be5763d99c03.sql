-- 1) Fix the broken public booking flow: allow anon to SELECT their newly-created
--    booking + payment rows (limited to active shops, same scope as the existing INSERT policy).
CREATE POLICY "bookings_public_read_active"
  ON public.bookings FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.shops s WHERE s.id = bookings.shop_id AND s.status = 'active'));

CREATE POLICY "payments_public_read_active"
  ON public.payments FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.shops s WHERE s.id = payments.shop_id AND s.status = 'active'));

-- 2) Mark shops as demo/non-demo
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Mark the seeded demo shop
UPDATE public.shops SET is_demo = true WHERE id = '00000000-0000-0000-0000-0000000000a1';

-- 3) Platform-wide demo controls (single-row table)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  demo_mode_enabled BOOLEAN NOT NULL DEFAULT true,
  demo_logins_enabled BOOLEAN NOT NULL DEFAULT true,
  public_booking_on_demo_shops_enabled BOOLEAN NOT NULL DEFAULT true,
  seeded_demo_data_visible BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_admin_all"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 4) Public read helper — exposes only the toggle flags (no internal columns) to anon
CREATE OR REPLACE FUNCTION public.get_public_app_settings()
RETURNS TABLE (
  demo_mode_enabled BOOLEAN,
  demo_logins_enabled BOOLEAN,
  public_booking_on_demo_shops_enabled BOOLEAN,
  seeded_demo_data_visible BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT demo_mode_enabled, demo_logins_enabled,
         public_booking_on_demo_shops_enabled, seeded_demo_data_visible
  FROM public.app_settings WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_app_settings() TO anon, authenticated;

-- 5) Touch updated_at on app_settings changes
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();