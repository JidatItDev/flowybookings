-- Server-side session lifetime policy (inactivity timeout + absolute max
-- age), enforced by Supabase Auth itself via the Custom Access Token Hook.
--
-- Why a hook instead of Dashboard > Authentication > Sessions: that native
-- feature (timebox / inactivity timeout) is Pro-plan-and-above only; this
-- project is on Free. The hook runs on every token issuance (sign-in AND
-- every refresh, for every auth method) and can outright reject the
-- request, which is real server-side enforcement — GoTrue itself refuses
-- to hand out a new token, independent of any client code.
--
-- To change the policy: UPDATE public.session_policy — takes effect on the
-- very next token refresh across all sessions, no redeploy needed.
--
-- One-time manual step required after this migration runs: Dashboard >
-- Authentication > Hooks > "Custom Access Token Hook" > enable, point it at
-- public.custom_access_token_hook. Cannot be done via SQL/migration.

CREATE TABLE IF NOT EXISTS public.session_policy (
  id boolean PRIMARY KEY DEFAULT true,
  inactivity_days integer NOT NULL DEFAULT 7,
  max_session_days integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_policy_singleton CHECK (id)
);

INSERT INTO public.session_policy (id, inactivity_days, max_session_days)
VALUES (true, 7, 30)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.session_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_policy FROM PUBLIC, anon, authenticated;

-- Per-session bookkeeping the hook needs to evaluate the two windows.
-- session_id is the GoTrue session id (stable across refresh-token
-- rotations of the same session, per JWT `session_id` claim).
CREATE TABLE IF NOT EXISTS public.session_activity (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_activity_last_seen_at_idx
  ON public.session_activity (last_seen_at);

ALTER TABLE public.session_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_activity FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_user_id uuid;
  v_first_seen timestamptz;
  v_last_seen timestamptz;
  v_inactivity_days integer;
  v_max_session_days integer;
BEGIN
  BEGIN
    v_session_id := (event #>> '{claims,session_id}')::uuid;
    v_user_id := (event ->> 'user_id')::uuid;

    IF v_session_id IS NULL THEN
      RETURN event;
    END IF;

    SELECT inactivity_days, max_session_days
      INTO v_inactivity_days, v_max_session_days
      FROM public.session_policy
      WHERE id = true;

    IF v_inactivity_days IS NULL THEN
      -- No policy row (shouldn't happen given the seed insert above) — fail open.
      RETURN event;
    END IF;

    SELECT first_seen_at, last_seen_at
      INTO v_first_seen, v_last_seen
      FROM public.session_activity
      WHERE session_id = v_session_id
      FOR UPDATE;

    IF NOT FOUND THEN
      -- First token issued for this session (sign-in). Start tracking, allow.
      INSERT INTO public.session_activity (session_id, user_id, first_seen_at, last_seen_at)
      VALUES (v_session_id, v_user_id, now(), now())
      ON CONFLICT (session_id) DO NOTHING;
      RETURN event;
    END IF;

    IF v_max_session_days > 0 AND now() - v_first_seen > make_interval(days => v_max_session_days) THEN
      RETURN jsonb_build_object('error', jsonb_build_object(
        'http_code', 403,
        'message', 'session_expired_max_age'
      ));
    END IF;

    IF v_inactivity_days > 0 AND now() - v_last_seen > make_interval(days => v_inactivity_days) THEN
      RETURN jsonb_build_object('error', jsonb_build_object(
        'http_code', 403,
        'message', 'session_expired_inactive'
      ));
    END IF;

    UPDATE public.session_activity
       SET last_seen_at = now()
     WHERE session_id = v_session_id;

    RETURN event;
  EXCEPTION WHEN OTHERS THEN
    -- Fail open: a bug in this policy layer must never lock every user out
    -- of the platform. Log it and let the token through.
    RAISE WARNING 'custom_access_token_hook failed, allowing through: %', SQLERRM;
    RETURN event;
  END;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;

-- Garbage-collect rows well past the configured max session age (+30 day
-- buffer so a config change doesn't retroactively wipe rows a still-valid
-- session needs).
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('cleanup-session-activity'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'cleanup-session-activity',
    '30 3 * * *',
    $cron$
    DELETE FROM public.session_activity
    WHERE last_seen_at < now() - make_interval(
      days => (SELECT COALESCE(max_session_days, 30) FROM public.session_policy LIMIT 1) + 30
    );
    $cron$
  );
END $$;
