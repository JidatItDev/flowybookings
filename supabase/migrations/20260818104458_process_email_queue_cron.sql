-- Drain transactional_emails every minute via the existing worker.
-- Auth mail stays on Supabase SMTP and is not in this queue.
--
-- Requires vault secret `email_queue_service_role_key` (the service_role JWT).
-- The job reads it at runtime so the key is not stored in cron.job / this file.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.secrets
    WHERE name = 'email_queue_service_role_key'
  ) THEN
    RAISE EXCEPTION
      'vault secret email_queue_service_role_key is missing — create it before applying this migration';
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-email-queue');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://www.flowybookings.com/lovable/email/queue/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
