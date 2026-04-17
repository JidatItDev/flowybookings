CREATE OR REPLACE FUNCTION public.get_default_shop_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT shop_id FROM (
    SELECT id AS shop_id, created_at, 1 AS rank FROM public.shops WHERE owner_id = _user_id
    UNION ALL
    SELECT shop_id, created_at, 2 AS rank FROM public.user_roles
      WHERE user_id = _user_id AND shop_id IS NOT NULL
  ) t
  ORDER BY rank, created_at
  LIMIT 1;
$$;