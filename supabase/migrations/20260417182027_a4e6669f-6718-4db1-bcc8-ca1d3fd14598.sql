-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'shop_owner', 'staff', 'customer');
CREATE TYPE public.shop_status AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'deposit_paid', 'paid', 'refunded', 'failed');
CREATE TYPE public.subscription_plan AS ENUM ('trial', 'starter', 'pro', 'premium');

-- =========================
-- TIMESTAMPS HELPER
-- =========================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- SHOPS (tenants)
-- =========================
CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.shop_status NOT NULL DEFAULT 'pending',
  plan public.subscription_plan NOT NULL DEFAULT 'trial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shops_owner ON public.shops(owner_id);
CREATE TRIGGER trg_shops_updated_at BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- USER ROLES (separate table to prevent privilege escalation)
-- Roles are scoped per-shop (shop_id NULL = platform-wide e.g. super_admin)
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, shop_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_shop ON public.user_roles(shop_id);

-- =========================
-- SECURITY DEFINER ROLE HELPERS
-- =========================
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_shop_access(_user_id UUID, _shop_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.shops
      WHERE id = _shop_id AND owner_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND shop_id = _shop_id
        AND role IN ('shop_owner', 'staff')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_shop_owner(_user_id UUID, _shop_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.shops
      WHERE id = _shop_id AND owner_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND shop_id = _shop_id AND role = 'shop_owner'
    );
$$;

-- =========================
-- STAFF
-- =========================
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_staff_shop ON public.staff(shop_id);
CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- SERVICES
-- =========================
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price_cents INTEGER NOT NULL DEFAULT 0,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_services_shop ON public.services(shop_id);
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- staff <-> services (many to many)
CREATE TABLE public.staff_services (
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;

-- =========================
-- CUSTOMERS (per shop)
-- =========================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_customers_shop ON public.customers(shop_id);
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- BOOKINGS
-- =========================
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'pending',
  price_cents INTEGER NOT NULL DEFAULT 0,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_bookings_shop_starts ON public.bookings(shop_id, starts_at);
CREATE INDEX idx_bookings_staff ON public.bookings(staff_id);
CREATE INDEX idx_bookings_customer ON public.bookings(customer_id);
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- PAYMENTS
-- =========================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  application_fee_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status public.payment_status NOT NULL DEFAULT 'unpaid',
  provider TEXT,
  provider_payment_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payments_shop ON public.payments(shop_id);
CREATE INDEX idx_payments_booking ON public.payments(booking_id);
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- RLS POLICIES
-- =========================

-- profiles: each user sees/updates own; super admin sees all
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- user_roles: users can read their own roles; only super admin can write
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- shops: public can read active shops (for booking page); owners/staff/admin manage
CREATE POLICY "shops_public_read_active" ON public.shops
  FOR SELECT TO anon, authenticated
  USING (status = 'active' OR public.has_shop_access(auth.uid(), id));
CREATE POLICY "shops_owner_update" ON public.shops
  FOR UPDATE TO authenticated
  USING (public.is_shop_owner(auth.uid(), id))
  WITH CHECK (public.is_shop_owner(auth.uid(), id));
CREATE POLICY "shops_owner_insert" ON public.shops
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "shops_admin_delete" ON public.shops
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- staff: public read for active shops (booking flow), shop manages own
CREATE POLICY "staff_public_read" ON public.staff
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    OR public.has_shop_access(auth.uid(), shop_id)
  );
CREATE POLICY "staff_shop_write" ON public.staff
  FOR ALL TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id))
  WITH CHECK (public.is_shop_owner(auth.uid(), shop_id));

-- services: public read active (booking), shop manages
CREATE POLICY "services_public_read" ON public.services
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    OR public.has_shop_access(auth.uid(), shop_id)
  );
CREATE POLICY "services_shop_write" ON public.services
  FOR ALL TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id))
  WITH CHECK (public.is_shop_owner(auth.uid(), shop_id));

-- staff_services: read public, write by shop
CREATE POLICY "staff_services_read" ON public.staff_services
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff_services_write" ON public.staff_services
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff s
            WHERE s.id = staff_id AND public.is_shop_owner(auth.uid(), s.shop_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff s
            WHERE s.id = staff_id AND public.is_shop_owner(auth.uid(), s.shop_id))
  );

-- customers: ONLY shop staff/owner/admin (PII protection)
CREATE POLICY "customers_shop_access" ON public.customers
  FOR ALL TO authenticated
  USING (public.has_shop_access(auth.uid(), shop_id))
  WITH CHECK (public.has_shop_access(auth.uid(), shop_id));

-- bookings: shop staff/owner/admin manage; allow public INSERT for booking flow
CREATE POLICY "bookings_shop_read" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.has_shop_access(auth.uid(), shop_id));
CREATE POLICY "bookings_shop_update" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.has_shop_access(auth.uid(), shop_id))
  WITH CHECK (public.has_shop_access(auth.uid(), shop_id));
CREATE POLICY "bookings_shop_delete" ON public.bookings
  FOR DELETE TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id));
CREATE POLICY "bookings_public_insert" ON public.bookings
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.shops WHERE id = shop_id AND status = 'active')
  );

-- payments: shop staff/owner/admin only
CREATE POLICY "payments_shop_access" ON public.payments
  FOR ALL TO authenticated
  USING (public.has_shop_access(auth.uid(), shop_id))
  WITH CHECK (public.has_shop_access(auth.uid(), shop_id));
