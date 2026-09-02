-- Schedules the pending-booking TTL sweep. Same vault app_url + cron_secret
-- pattern as 20260820130000_billing_crons_app_url.sql — do not hardcode the
-- host here.

DO $$
DECLARE
  v_key text;
  v_auth text;
  v_base text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_key := NULL;
  END;

  IF v_key IS NULL OR v_key = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_key := NULL;
    END;
  END IF;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE NOTICE 'No cron_secret / email_queue_service_role_key in vault — skip booking-expiry cron schedule';
    RETURN;
  END IF;

  SELECT rtrim(decrypted_secret, '/') INTO v_base FROM vault.decrypted_secrets WHERE name = 'app_url' LIMIT 1;
  IF v_base IS NULL OR v_base = '' THEN
    RAISE EXCEPTION 'vault secret app_url is empty';
  END IF;

  v_auth := 'Bearer ' || v_key;

  BEGIN PERFORM cron.unschedule('booking-expiry-sweep'); EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Every 10 minutes: TTL is 30 minutes, so this bounds the worst-case lag
  -- between a booking going stale and its slot being released.
  PERFORM cron.schedule(
    'booking-expiry-sweep',
    '*/10 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L),
        body := '{}'::jsonb
      );
      $cron$,
      v_base || '/hooks/booking-expiry',
      v_auth
    )
  );
END $$;
