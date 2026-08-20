-- Point process-email-queue cron at Edge Function using vault `supabase_url`.
-- Requires vault secret `supabase_url` (project API origin, no trailing slash).
-- Requires vault secret `email_queue_service_role_key` (already used by prior cron).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'supabase_url'
  ) THEN
    RAISE EXCEPTION
      'vault secret supabase_url is missing — create it before applying this migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'email_queue_service_role_key'
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
    url := rtrim(
      (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'supabase_url'
        LIMIT 1
      ),
      '/'
    ) || '/functions/v1/process-email-queue',
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
