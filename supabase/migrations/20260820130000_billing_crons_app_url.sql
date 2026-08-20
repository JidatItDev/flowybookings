-- Retarget Mollie Connect refresh + billing expiry/reconcile crons to vault `app_url`.
-- Same pattern as email queue cron (vault `supabase_url`): change host by updating
-- vault only — no new SQL on Lovable → Render cutover.
--
-- Requires vault secret `app_url` = public HTTPS origin that serves /hooks/* and
-- /api/mollie/webhook (no trailing slash), e.g. https://www.flowybookings.com
-- Auth: vault `cron_secret` preferred; fallback `email_queue_service_role_key`.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'app_url'
  ) THEN
    RAISE EXCEPTION
      'vault secret app_url is missing — create it (public HTTPS app origin, no trailing slash) before applying this migration';
  END IF;
END $$;

DO $$
DECLARE
  v_key text;
  v_auth text;
  v_base text;
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

  SELECT rtrim(decrypted_secret, '/') INTO v_base
  FROM vault.decrypted_secrets
  WHERE name = 'app_url'
  LIMIT 1;

  IF v_base IS NULL OR v_base = '' THEN
    RAISE EXCEPTION 'vault secret app_url is empty';
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
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_base || '/hooks/mollie-refresh-tokens',
      v_auth
    )
  );

  PERFORM cron.schedule(
    'billing-reconcile',
    '15 4 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_base || '/hooks/billing-reconcile',
      v_auth
    )
  );

  PERFORM cron.schedule(
    'billing-expiry',
    '45 4 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_base || '/hooks/billing-expiry',
      v_auth
    )
  );
END $$;
