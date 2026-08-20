-- Reschedule Mollie Connect refresh + billing expiry/reconcile crons to production APP_URL.
-- Uses vault secret cron_secret when present; otherwise keeps service-role-style caller
-- configuration out of this file (hooks also accept CRON_SECRET env on the app).

DO $$
DECLARE
  v_key text;
  v_auth text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR v_key = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets
      WHERE name = 'email_queue_service_role_key'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_key := NULL;
    END;
  END IF;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE NOTICE 'No cron_secret / email_queue_service_role_key in vault — skip cron reschedule';
    RETURN;
  END IF;

  v_auth := 'Bearer ' || v_key;

  BEGIN PERFORM cron.unschedule('mollie-connect-refresh-tokens'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('billing-expiry'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('billing-reconcile'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('expire-cancelled-subscriptions'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule(
    'mollie-connect-refresh-tokens',
    '0 */4 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := 'https://www.flowybookings.com/hooks/mollie-refresh-tokens',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_auth
    )
  );

  PERFORM cron.schedule(
    'billing-reconcile',
    '15 4 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := 'https://www.flowybookings.com/hooks/billing-reconcile',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_auth
    )
  );

  PERFORM cron.schedule(
    'billing-expiry',
    '45 4 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := 'https://www.flowybookings.com/hooks/billing-expiry',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_auth
    )
  );
END $$;
