-- DB-backed notification templates + admin read access to send log.
-- New email types are added via later migrations (no browser INSERT in v1).

CREATE TABLE IF NOT EXISTS public.email_templates (
  type text PRIMARY KEY,
  display_name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  allowed_vars text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "email_templates_service_all"
    ON public.email_templates FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "email_templates_admin_select"
    ON public.email_templates FOR SELECT
    TO authenticated
    USING (public.is_super_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "email_templates_admin_update"
    ON public.email_templates FOR UPDATE
    TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.email_templates (type, display_name, subject, body_html, body_text, allowed_vars)
VALUES (
  'system_test',
  'System test',
  'FlowyBookings test email',
  '<html lang="en"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">This is a test email</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hello from <strong>{{shopName}}</strong>.</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">If you received this, the notification email pipeline is working.</p>'
    '</body></html>',
  'This is a test email from {{shopName}}. If you received this, the notification email pipeline is working.',
  ARRAY['shopName']
)
ON CONFLICT (type) DO NOTHING;

GRANT SELECT, UPDATE ON TABLE public.email_templates TO authenticated;
GRANT ALL ON TABLE public.email_templates TO service_role;
REVOKE ALL ON TABLE public.email_templates FROM anon, public;

-- Super admins can inspect send status in the admin UI. Writes stay service_role-only.
DO $$ BEGIN
  CREATE POLICY "email_send_log_admin_select"
    ON public.email_send_log FOR SELECT
    TO authenticated
    USING (public.is_super_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drain transactional_emails via the existing worker. Auth mail stays on Supabase SMTP.
-- Uses vault secret email_queue_service_role_key when present; otherwise skips scheduling.
DO $$
DECLARE
  v_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'vault unavailable — skip process-email-queue cron';
    RETURN;
  END;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE NOTICE 'email_queue_service_role_key missing in vault — skip process-email-queue cron';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('process-email-queue');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'process-email-queue',
    '* * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := 'https://www.flowybookings.com/lovable/email/queue/process',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_key
    )
  );
END $$;
