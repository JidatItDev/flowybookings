-- =============================================================================
-- Restore verification for FlowyBookings / apppoint-craft
-- Run in Supabase SQL Editor, or:
--   psql "$DATABASE_URL" -f verify_restore.sql
-- =============================================================================

-- 0) Refresh planner stats after restore (approx counts become usable)
ANALYZE;

-- 1) Schemas present
SELECT nspname AS schema
FROM pg_namespace
WHERE nspname IN ('public', 'auth', 'storage', 'realtime', 'extensions')
ORDER BY 1;

-- 2) Approx row counts (fast)
SELECT
  schemaname AS schema,
  relname AS table_name,
  n_live_tup AS approx_rows
FROM pg_stat_user_tables
WHERE schemaname IN ('public', 'auth', 'storage')
ORDER BY schemaname, relname;

-- 3) Exact counts for key business + auth tables
SELECT 'auth.users' AS table_name, count(*) AS rows FROM auth.users
UNION ALL SELECT 'auth.identities', count(*) FROM auth.identities
UNION ALL SELECT 'auth.sessions', count(*) FROM auth.sessions
UNION ALL SELECT 'public.shops', count(*) FROM public.shops
UNION ALL SELECT 'public.profiles', count(*) FROM public.profiles
UNION ALL SELECT 'public.user_roles', count(*) FROM public.user_roles
UNION ALL SELECT 'public.staff', count(*) FROM public.staff
UNION ALL SELECT 'public.customers', count(*) FROM public.customers
UNION ALL SELECT 'public.services', count(*) FROM public.services
UNION ALL SELECT 'public.bookings', count(*) FROM public.bookings
UNION ALL SELECT 'public.payments', count(*) FROM public.payments
UNION ALL SELECT 'public.notifications', count(*) FROM public.notifications
UNION ALL SELECT 'public.plan_features', count(*) FROM public.plan_features
UNION ALL SELECT 'public.plan_pricing', count(*) FROM public.plan_pricing
UNION ALL SELECT 'storage.buckets', count(*) FROM storage.buckets
UNION ALL SELECT 'storage.objects', count(*) FROM storage.objects
ORDER BY 1;

-- 4) Auth users summary
SELECT
  count(*) AS total_users,
  count(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS confirmed,
  count(*) FILTER (WHERE banned_until IS NOT NULL) AS banned,
  count(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted,
  min(created_at) AS oldest_created,
  max(created_at) AS newest_created
FROM auth.users;

-- 5) All auth users + providers (login will fail if providers = none)
SELECT
  u.id,
  u.email,
  u.created_at::date AS created,
  u.email_confirmed_at IS NOT NULL AS confirmed,
  coalesce(
    (
      SELECT string_agg(i.provider, ', ' ORDER BY i.provider)
      FROM auth.identities i
      WHERE i.user_id = u.id
    ),
    '(none)'
  ) AS providers
FROM auth.users u
ORDER BY u.created_at;

-- 6) Orphan / linkage checks (expect identities == users for password/OAuth login)
SELECT
  (SELECT count(*) FROM auth.users) AS users,
  (SELECT count(*) FROM auth.identities) AS identities,
  (
    SELECT count(*)
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
    )
  ) AS users_without_identity;

SELECT
  (SELECT count(*) FROM public.profiles) AS profiles,
  (
    SELECT count(*)
    FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ) AS profiles_missing_auth_user,
  (
    SELECT count(*)
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
  ) AS auth_users_missing_profile;

SELECT
  (SELECT count(*) FROM public.user_roles) AS user_roles,
  (
    SELECT count(*)
    FROM public.user_roles r
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id)
  ) AS roles_missing_auth_user;
