
-- Activity log for critical admin/owner changes (plan changes, shop status changes, etc).
-- Append-only. Visible to super admins; shop owners see entries about their own shops.

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  entity text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_shop_id_idx ON public.activity_log (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON public.activity_log (created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Super admins can read everything
CREATE POLICY "activity_log_admin_select"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Shop owners can read entries for their own shop
CREATE POLICY "activity_log_owner_select"
  ON public.activity_log FOR SELECT TO authenticated
  USING (shop_id IS NOT NULL AND public.is_shop_owner(auth.uid(), shop_id));

-- Authenticated users can insert if they are super admin OR own the shop in question
CREATE POLICY "activity_log_insert"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (shop_id IS NOT NULL AND public.is_shop_owner(auth.uid(), shop_id))
  );

-- No update/delete: append-only
