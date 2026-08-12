-- Resolve a public booking shop by UUID or slug.
-- Bypasses anon RLS so we can distinguish not_found vs inactive vs unavailable.
-- Note: RETURNS TABLE column names (slug, name, ...) shadow bare identifiers —
-- always qualify shops columns as s.* and use local v_* variables.

CREATE OR REPLACE FUNCTION public.resolve_public_booking_shop(_ref text)
RETURNS TABLE (
  found boolean,
  shop_id uuid,
  name text,
  slug text,
  logo_url text,
  block_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := trim(_ref);
  v_id uuid;
  v_name text;
  v_slug text;
  v_logo text;
  v_status public.shop_status;
BEGIN
  IF v_ref IS NULL OR v_ref = '' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, NULL::text, 'not_found'::text;
    RETURN;
  END IF;

  IF v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT s.id, s.name, s.slug, s.logo_url, s.status
      INTO v_id, v_name, v_slug, v_logo, v_status
      FROM public.shops s
     WHERE s.id = v_ref::uuid;
  ELSE
    SELECT s.id, s.name, s.slug, s.logo_url, s.status
      INTO v_id, v_name, v_slug, v_logo, v_status
      FROM public.shops s
     WHERE s.slug = v_ref;
  END IF;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, NULL::text, 'not_found'::text;
    RETURN;
  END IF;

  IF v_status IS DISTINCT FROM 'active'::public.shop_status THEN
    RETURN QUERY SELECT true, v_id, v_name, v_slug, v_logo, 'inactive'::text;
    RETURN;
  END IF;

  IF NOT public.shop_can_accept_bookings(v_id) THEN
    RETURN QUERY SELECT true, v_id, v_name, v_slug, v_logo, 'unavailable'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_id, v_name, v_slug, v_logo, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_public_booking_shop(text) TO anon, authenticated;
