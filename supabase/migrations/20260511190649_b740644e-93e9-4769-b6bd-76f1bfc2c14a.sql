
-- 1. Extend user_roles with invite/expiry/disable metadata
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_by uuid;

-- 2. Helper: is a given role row currently active?
CREATE OR REPLACE FUNCTION public.is_role_active(_disabled_at timestamptz, _expires_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _disabled_at IS NULL AND (_expires_at IS NULL OR _expires_at > now());
$$;

-- 3. is_platform_admin: any non-disabled/non-expired admin-tier role
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin','admin','support','read_only_admin')
      AND public.is_role_active(ur.disabled_at, ur.expires_at)
  );
$$;

-- 4. is_admin_writer: only super_admin or admin (active)
CREATE OR REPLACE FUNCTION public.is_admin_writer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin','admin')
      AND public.is_role_active(ur.disabled_at, ur.expires_at)
  );
$$;

-- 5. admin_invites
CREATE TABLE IF NOT EXISTS public.admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL,
  label text,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid,
  invited_by_email text,
  accepted_user_id uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_invites_token_key ON public.admin_invites(token);
CREATE INDEX IF NOT EXISTS admin_invites_email_idx ON public.admin_invites(lower(email));

ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_invites_admin_all ON public.admin_invites;
CREATE POLICY admin_invites_admin_all ON public.admin_invites
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 6. admin_login_log
CREATE TABLE IF NOT EXISTS public.admin_login_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  role text,
  success boolean NOT NULL DEFAULT true,
  failure_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_login_log_created_at_idx ON public.admin_login_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_login_log_user_idx ON public.admin_login_log(user_id);

ALTER TABLE public.admin_login_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_login_log_admin_select ON public.admin_login_log;
CREATE POLICY admin_login_log_admin_select ON public.admin_login_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Allow self-insert (user logs their own login). Also allow anon for failed-login audit.
DROP POLICY IF EXISTS admin_login_log_self_insert ON public.admin_login_log;
CREATE POLICY admin_login_log_self_insert ON public.admin_login_log
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
  );

-- 7. Allow super_admin / admin to manage admin-tier user_roles via RLS (already covered by user_roles_admin_all for super_admin; nothing extra needed for admin since we keep super-admin-only writes for safety).
