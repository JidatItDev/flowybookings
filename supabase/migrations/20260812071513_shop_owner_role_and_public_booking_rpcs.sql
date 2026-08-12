-- Issue 1: auto-assign shop_owner role on shop creation + backfill existing shops
CREATE OR REPLACE FUNCTION public.handle_new_shop_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, shop_id)
    VALUES (NEW.owner_id, 'shop_owner', NEW.id)
    ON CONFLICT (user_id, role, shop_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_shop_created_assign_owner_role ON public.shops;
CREATE TRIGGER on_shop_created_assign_owner_role
  AFTER INSERT ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_shop_owner_role();

INSERT INTO public.user_roles (user_id, role, shop_id)
SELECT s.owner_id, 'shop_owner'::public.app_role, s.id
FROM public.shops s
WHERE s.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = s.owner_id
      AND ur.role = 'shop_owner'
      AND ur.shop_id = s.id
  )
ON CONFLICT (user_id, role, shop_id) DO NOTHING;

-- Issue 2: scoped public booking RPCs (replace broad anon SELECT policies)

CREATE OR REPLACE FUNCTION public.get_public_bookings_for_availability(
  _shop_id uuid,
  _range_start timestamptz,
  _range_end timestamptz
)
RETURNS TABLE (
  starts_at timestamptz,
  ends_at timestamptz,
  staff_id uuid,
  status public.booking_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.starts_at, b.ends_at, b.staff_id, b.status
  FROM public.bookings b
  WHERE b.shop_id = _shop_id
    AND b.status IN ('pending', 'confirmed')
    AND b.starts_at >= _range_start
    AND b.starts_at <= _range_end
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = _shop_id AND s.status = 'active'
    )
    AND public.shop_can_accept_bookings(_shop_id);
$$;

CREATE OR REPLACE FUNCTION public.get_public_busy_staff_ids(
  _shop_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT b.staff_id
  FROM public.bookings b
  WHERE b.shop_id = _shop_id
    AND b.staff_id IS NOT NULL
    AND b.status IN ('pending', 'confirmed')
    AND b.starts_at < _ends_at
    AND b.ends_at > _starts_at
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = _shop_id AND s.status = 'active'
    )
    AND public.shop_can_accept_bookings(_shop_id);
$$;

CREATE OR REPLACE FUNCTION public.public_booking_staff_has_conflict(
  _shop_id uuid,
  _staff_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.shop_id = _shop_id
      AND b.staff_id = _staff_id
      AND b.status IN ('pending', 'confirmed')
      AND b.starts_at < _ends_at
      AND b.ends_at > _starts_at
      AND EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.id = _shop_id AND s.status = 'active'
      )
      AND public.shop_can_accept_bookings(_shop_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.find_public_customer_id_by_email(
  _shop_id uuid,
  _email text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.customers c
  WHERE c.shop_id = _shop_id
    AND lower(trim(c.email)) = lower(trim(_email))
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = _shop_id AND s.status = 'active'
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_booking_confirmation(_booking_id uuid)
RETURNS TABLE (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.booking_status,
  price_cents integer,
  deposit_cents integer,
  currency text,
  shop_id uuid,
  service_id uuid,
  staff_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.starts_at,
    b.ends_at,
    b.status,
    b.price_cents,
    b.deposit_cents,
    b.currency,
    b.shop_id,
    b.service_id,
    b.staff_id
  FROM public.bookings b
  WHERE b.id = _booking_id
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = b.shop_id AND s.status = 'active'
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_bookings_for_availability(uuid, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_busy_staff_ids(uuid, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_booking_staff_has_conflict(uuid, uuid, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_public_customer_id_by_email(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_confirmation(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "customers_public_select_by_shop" ON public.customers;
DROP POLICY IF EXISTS "bookings_public_read_active" ON public.bookings;
