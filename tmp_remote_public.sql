


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'super_admin',
    'shop_owner',
    'staff',
    'customer',
    'admin',
    'support',
    'read_only_admin'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."booking_status" AS ENUM (
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'no_show'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'system',
    'billing',
    'bookings',
    'alerts',
    'admin'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'unpaid',
    'deposit_paid',
    'paid',
    'refunded',
    'failed'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."shop_status" AS ENUM (
    'active',
    'suspended',
    'pending'
);


ALTER TYPE "public"."shop_status" OWNER TO "postgres";


CREATE TYPE "public"."subscription_plan" AS ENUM (
    'trial',
    'starter',
    'pro',
    'premium'
);


ALTER TYPE "public"."subscription_plan" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_mollie_token_key"() RETURNS "bytea"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
  SELECT decode(decrypted_secret, 'hex')
  FROM vault.decrypted_secrets WHERE name = 'mollie_token_key' LIMIT 1;
$$;


ALTER FUNCTION "public"."_mollie_token_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_broadcast_notification"("_title" "text", "_message" "text", "_type" "public"."notification_type" DEFAULT 'admin'::"public"."notification_type", "_action_url" "text" DEFAULT NULL::"text", "_shop_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  inserted int;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can broadcast';
  END IF;

  IF _shop_ids IS NULL OR array_length(_shop_ids, 1) IS NULL THEN
    INSERT INTO public.notifications (shop_id, type, title, message, action_url, created_by)
    SELECT id, _type, _title, _message, _action_url, auth.uid() FROM public.shops;
  ELSE
    INSERT INTO public.notifications (shop_id, type, title, message, action_url, created_by)
    SELECT unnest(_shop_ids), _type, _title, _message, _action_url, auth.uid();
  END IF;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;


ALTER FUNCTION "public"."admin_broadcast_notification"("_title" "text", "_message" "text", "_type" "public"."notification_type", "_action_url" "text", "_shop_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_sms_credit"("_shop_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.shop_sms_credits
  SET balance = balance - 1,
      total_used = total_used + 1,
      updated_at = now()
  WHERE shop_id = _shop_id AND balance > 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;


ALTER FUNCTION "public"."consume_sms_credit"("_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrypt_mollie_token"("ciphertext" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_key bytea; v_raw bytea; v_iv bytea; v_cipher bytea;
BEGIN
  IF ciphertext IS NULL OR ciphertext = '' THEN RETURN NULL; END IF;
  v_key := public._mollie_token_key();
  IF v_key IS NULL THEN RAISE EXCEPTION 'mollie_token_key missing in vault'; END IF;
  v_raw := decode(ciphertext, 'base64');
  v_iv := substring(v_raw FROM 1 FOR 16);
  v_cipher := substring(v_raw FROM 17);
  RETURN convert_from(decrypt_iv(v_cipher, v_key, v_iv, 'aes-cbc/pad:pkcs'), 'utf8');
END;
$$;


ALTER FUNCTION "public"."decrypt_mollie_token"("ciphertext" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_email"("queue_name" "text", "message_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."delete_email"("queue_name" "text", "message_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."encrypt_mollie_token"("plaintext" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_key bytea; v_iv bytea; v_cipher bytea;
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN RETURN NULL; END IF;
  v_key := public._mollie_token_key();
  IF v_key IS NULL THEN RAISE EXCEPTION 'mollie_token_key missing in vault'; END IF;
  v_iv := gen_random_bytes(16);
  v_cipher := encrypt_iv(convert_to(plaintext, 'utf8'), v_key, v_iv, 'aes-cbc/pad:pkcs');
  RETURN encode(v_iv || v_cipher, 'base64');
END;
$$;


ALTER FUNCTION "public"."encrypt_mollie_token"("plaintext" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_email"("queue_name" "text", "payload" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;


ALTER FUNCTION "public"."enqueue_email"("queue_name" "text", "payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_default_shop_id"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT shop_id FROM (
    SELECT id AS shop_id, created_at, 1 AS rank FROM public.shops WHERE owner_id = _user_id
    UNION ALL
    SELECT shop_id, created_at, 2 AS rank FROM public.user_roles
      WHERE user_id = _user_id AND shop_id IS NOT NULL
  ) t
  ORDER BY rank, created_at
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_default_shop_id"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_app_settings"() RETURNS TABLE("demo_mode_enabled" boolean, "demo_logins_enabled" boolean, "public_booking_on_demo_shops_enabled" boolean, "seeded_demo_data_visible" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT demo_mode_enabled, demo_logins_enabled,
         public_booking_on_demo_shops_enabled, seeded_demo_data_visible
  FROM public.app_settings WHERE id = 1;
$$;


ALTER FUNCTION "public"."get_public_app_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shop_feature_access"("_shop_id" "uuid", "_feature_slug" "text") RETURNS TABLE("allowed" boolean, "limit_value" integer, "used" integer, "upgrade_plan" "text", "current_plan" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan public.subscription_plan;
  v_included boolean;
  v_limit integer;
  v_used integer := 0;
  v_upgrade text := NULL;
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end timestamptz := (date_trunc('month', now()) + interval '1 month');
  v_override_included boolean;
  v_override_limit integer;
  v_has_override boolean := false;
BEGIN
  IF NOT public.has_shop_access(auth.uid(), _shop_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT plan INTO v_plan FROM public.shops WHERE id = _shop_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'shop not found';
  END IF;

  SELECT pf.is_included, pf.limit_value
    INTO v_included, v_limit
    FROM public.plan_features pf
   WHERE pf.plan_name = v_plan AND pf.feature_slug = _feature_slug;

  SELECT o.is_included, o.limit_value, true
    INTO v_override_included, v_override_limit, v_has_override
    FROM public.shop_feature_overrides o
   WHERE o.shop_id = _shop_id
     AND o.feature_slug = _feature_slug
     AND (o.expires_at IS NULL OR o.expires_at > now())
   LIMIT 1;

  IF v_has_override THEN
    v_included := v_override_included;
    v_limit := v_override_limit;
  END IF;

  IF _feature_slug = 'sms_reminders' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.sms_send_log
     WHERE shop_id = _shop_id
       AND status NOT IN ('skipped_no_credits', 'failed')
       AND created_at >= v_month_start
       AND created_at <  v_month_end;
  ELSIF _feature_slug = 'marketing_emails' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.email_send_log
     WHERE template_name = 'marketing'
       AND created_at >= v_month_start
       AND created_at <  v_month_end
       AND (metadata->>'shop_id') = _shop_id::text;
  ELSIF _feature_slug = 'max_bookings_per_month' THEN
    IF v_plan = 'trial' THEN
      SELECT COUNT(*)::int INTO v_used
        FROM public.bookings
       WHERE shop_id = _shop_id;
    ELSE
      SELECT COUNT(*)::int INTO v_used
        FROM public.bookings
       WHERE shop_id = _shop_id
         AND created_at >= v_month_start
         AND created_at <  v_month_end;
    END IF;
  ELSIF _feature_slug = 'max_staff' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.staff
     WHERE shop_id = _shop_id AND is_active = true;
  ELSE
    v_used := 0;
  END IF;

  IF COALESCE(v_included, false) = false THEN
    SELECT pf.plan_name::text INTO v_upgrade
      FROM public.plan_features pf
     WHERE pf.feature_slug = _feature_slug
       AND pf.is_included = true
     ORDER BY CASE pf.plan_name
                WHEN 'trial'   THEN 1
                WHEN 'starter' THEN 2
                WHEN 'pro'     THEN 3
                WHEN 'premium' THEN 4
              END
     LIMIT 1;
  ELSIF v_limit IS NOT NULL AND v_used >= v_limit THEN
    SELECT pf.plan_name::text INTO v_upgrade
      FROM public.plan_features pf
     WHERE pf.feature_slug = _feature_slug
       AND pf.is_included = true
       AND (pf.limit_value IS NULL OR pf.limit_value > v_limit)
       AND CASE pf.plan_name
             WHEN 'trial'   THEN 1
             WHEN 'starter' THEN 2
             WHEN 'pro'     THEN 3
             WHEN 'premium' THEN 4
           END > CASE v_plan
             WHEN 'trial'   THEN 1
             WHEN 'starter' THEN 2
             WHEN 'pro'     THEN 3
             WHEN 'premium' THEN 4
           END
     ORDER BY CASE pf.plan_name
                WHEN 'trial'   THEN 1
                WHEN 'starter' THEN 2
                WHEN 'pro'     THEN 3
                WHEN 'premium' THEN 4
              END
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_included, false)
      AND (v_limit IS NULL OR v_used < v_limit) AS allowed,
    v_limit,
    v_used,
    v_upgrade,
    v_plan::text;
END;
$$;


ALTER FUNCTION "public"."get_shop_feature_access"("_shop_id" "uuid", "_feature_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_shop_automations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.shop_automations (shop_id) VALUES (NEW.id)
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_shop_automations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_shop_sms_credits"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.shop_sms_credits (shop_id, balance, free_credits_granted)
  VALUES (NEW.id, 10, 10)
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_shop_sms_credits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_shop_trial"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.plan = 'trial' AND NEW.plan_expires_at IS NULL THEN
    NEW.plan_expires_at := now() + interval '14 days';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_shop_trial"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_shop_access"("_user_id" "uuid", "_shop_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.shops
      WHERE id = _shop_id AND owner_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND shop_id = _shop_id
        AND role IN ('shop_owner', 'staff')
    );
$$;


ALTER FUNCTION "public"."has_shop_access"("_user_id" "uuid", "_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_writer"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin','admin')
      AND public.is_role_active(ur.disabled_at, ur.expires_at)
  );
$$;


ALTER FUNCTION "public"."is_admin_writer"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin','admin','support','read_only_admin')
      AND public.is_role_active(ur.disabled_at, ur.expires_at)
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_role_active"("_disabled_at" timestamp with time zone, "_expires_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT _disabled_at IS NULL AND (_expires_at IS NULL OR _expires_at > now());
$$;


ALTER FUNCTION "public"."is_role_active"("_disabled_at" timestamp with time zone, "_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_shop_owner"("_user_id" "uuid", "_shop_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.shops
      WHERE id = _shop_id AND owner_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND shop_id = _shop_id AND role = 'shop_owner'
    );
$$;


ALTER FUNCTION "public"."is_shop_owner"("_user_id" "uuid", "_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_super_admin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_booking_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_customer text;
  v_service text;
  v_when text;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    SELECT c.full_name INTO v_customer FROM public.customers c WHERE c.id = NEW.customer_id;
    SELECT s.name INTO v_service FROM public.services s WHERE s.id = NEW.service_id;
    v_when := to_char(NEW.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI');
    INSERT INTO public.notifications (shop_id, type, title, message, action_url, metadata)
    VALUES (
      NEW.shop_id,
      'bookings',
      'New booking',
      COALESCE(v_customer, 'A customer') || ' booked ' || COALESCE(v_service, 'a service') || ' at ' || v_when,
      '/shop/calendar',
      jsonb_build_object('booking_id', NEW.id, 'event', 'created')
    );
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      SELECT c.full_name INTO v_customer FROM public.customers c WHERE c.id = NEW.customer_id;
      INSERT INTO public.notifications (shop_id, type, title, message, action_url, metadata)
      VALUES (
        NEW.shop_id,
        'bookings',
        'Booking cancelled',
        COALESCE(v_customer, 'A customer') || ' cancelled their appointment',
        '/shop/calendar',
        jsonb_build_object('booking_id', NEW.id, 'event', 'cancelled')
      );
    ELSIF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
      -- High-no-show alert: trigger when the customer crosses threshold
      IF NEW.customer_id IS NOT NULL THEN
        DECLARE v_count int;
        BEGIN
          SELECT no_show_count INTO v_count FROM public.customers WHERE id = NEW.customer_id;
          IF v_count IS NOT NULL AND v_count >= 3 THEN
            INSERT INTO public.notifications (shop_id, type, title, message, action_url, metadata)
            VALUES (
              NEW.shop_id,
              'alerts',
              'High no-show customer',
              'A customer has reached ' || v_count || ' no-shows. Consider requiring a deposit.',
              '/shop/customers',
              jsonb_build_object('customer_id', NEW.customer_id, 'event', 'high_no_show')
            );
          END IF;
        END;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."notify_on_booking_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_welcome_shop_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_url text := 'https://www.flowybookings.com/hooks/welcome-shop-owner';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsdnZiYm5sc2Z6bXRvb2d3dHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTM2NTIsImV4cCI6MjA5MjE4OTY1Mn0.ra7Z31Cb5ZNEson2dyzNIhYOfSXkSHfT-FS-WBjA2UA';
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'Lovable-Context', 'db-trigger'
      ),
      body := jsonb_build_object('shopId', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the shop insert because of email
    RAISE WARNING 'notify_welcome_shop_owner failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_welcome_shop_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_booking_outside_staff_hours"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_wh             jsonb;
  v_tz             text;
  v_local_start    timestamp;
  v_local_end      timestamp;
  v_day_key        text;
  v_day            jsonb;
  v_open           text;
  v_close          text;
  v_closed         boolean;
  v_breaks         jsonb;
  v_break          jsonb;
  v_start_min      int;
  v_end_min        int;
  v_open_min       int;
  v_close_min      int;
  v_break_start    int;
  v_break_end      int;
  v_has_structured boolean := false;
  v_day_keys       text[] := ARRAY['sun','mon','tue','wed','thu','fri','sat'];
BEGIN
  -- Skip als geen staff toegewezen of cancelled/no_show
  IF NEW.staff_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('cancelled', 'no_show') THEN RETURN NEW; END IF;

  -- Haal staff working_hours en shop timezone op
  SELECT s.working_hours, sh.timezone
    INTO v_wh, v_tz
    FROM public.staff s
    JOIN public.shops sh ON sh.id = s.shop_id
   WHERE s.id = NEW.staff_id;

  IF v_wh IS NULL OR jsonb_typeof(v_wh) <> 'object' THEN
    RETURN NEW; -- geen data → niets te enforcen
  END IF;

  -- Check of er überhaupt gestructureerde dag-data bestaat; zo niet → skip (legacy)
  FOR v_day_key IN SELECT unnest(v_day_keys) LOOP
    IF v_wh ? v_day_key AND jsonb_typeof(v_wh -> v_day_key) = 'object' THEN
      v_has_structured := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_has_structured THEN
    RETURN NEW; -- alleen vrije tekst / leeg → geen enforcement
  END IF;

  -- Converteer naar lokale tijd van de shop
  v_tz := COALESCE(NULLIF(v_tz, ''), 'UTC');
  v_local_start := (NEW.starts_at AT TIME ZONE v_tz);
  v_local_end   := (NEW.ends_at   AT TIME ZONE v_tz);

  -- Booking moet binnen één lokale dag vallen
  IF date_trunc('day', v_local_start) <> date_trunc('day', v_local_end - interval '1 microsecond') THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: booking spans multiple days in shop timezone'
      USING ERRCODE = 'P0001';
  END IF;

  -- Bepaal dag-key (0=zo .. 6=za in postgres dow)
  v_day_key := v_day_keys[EXTRACT(DOW FROM v_local_start)::int + 1];
  v_day := v_wh -> v_day_key;

  IF v_day IS NULL OR jsonb_typeof(v_day) <> 'object' THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: staff is not scheduled on % (%)',
      to_char(v_local_start, 'Day'), v_day_key
      USING ERRCODE = 'P0001';
  END IF;

  v_closed := COALESCE((v_day ->> 'closed')::boolean, false);
  IF v_closed THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: staff is off on % (%)',
      to_char(v_local_start, 'Day'), v_day_key
      USING ERRCODE = 'P0001';
  END IF;

  v_open  := v_day ->> 'open';
  v_close := v_day ->> 'close';
  IF v_open IS NULL OR v_close IS NULL THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: staff has no working hours set for % (%)',
      to_char(v_local_start, 'Day'), v_day_key
      USING ERRCODE = 'P0001';
  END IF;

  -- Minuten sinds middernacht
  v_start_min := EXTRACT(HOUR FROM v_local_start)::int * 60 + EXTRACT(MINUTE FROM v_local_start)::int;
  v_end_min   := EXTRACT(HOUR FROM v_local_end)::int   * 60 + EXTRACT(MINUTE FROM v_local_end)::int;
  -- Behandel exact middernacht aan einde als 24:00
  IF v_end_min = 0 AND v_local_end > v_local_start THEN v_end_min := 24 * 60; END IF;

  v_open_min  := (split_part(v_open,  ':', 1))::int * 60 + (split_part(v_open,  ':', 2))::int;
  v_close_min := (split_part(v_close, ':', 1))::int * 60 + (split_part(v_close, ':', 2))::int;

  IF v_start_min < v_open_min OR v_end_min > v_close_min THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: % is outside staff working hours (%-%)',
      to_char(v_local_start, 'HH24:MI'), v_open, v_close
      USING ERRCODE = 'P0001';
  END IF;

  -- Pauzes: half-open overlap [start,end) met booking [v_start_min,v_end_min)
  v_breaks := v_day -> 'breaks';
  IF v_breaks IS NOT NULL AND jsonb_typeof(v_breaks) = 'array' THEN
    FOR v_break IN SELECT * FROM jsonb_array_elements(v_breaks) LOOP
      IF (v_break ->> 'start') IS NULL OR (v_break ->> 'end') IS NULL THEN CONTINUE; END IF;
      v_break_start := (split_part(v_break ->> 'start', ':', 1))::int * 60 + (split_part(v_break ->> 'start', ':', 2))::int;
      v_break_end   := (split_part(v_break ->> 'end',   ':', 1))::int * 60 + (split_part(v_break ->> 'end',   ':', 2))::int;
      IF v_start_min < v_break_end AND v_end_min > v_break_start THEN
        RAISE EXCEPTION 'BOOKING_DURING_BREAK: booking overlaps staff break (%-%)',
          v_break ->> 'start', v_break ->> 'end'
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_booking_outside_staff_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_overlapping_staff_bookings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_conflict_id uuid;
  v_conflict_starts timestamptz;
  v_conflict_ends timestamptz;
BEGIN
  -- Skip if no staff assigned, or this booking itself is cancelled/no_show
  IF NEW.staff_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

  -- Half-open interval overlap check: [starts_at, ends_at)
  -- Two intervals A and B overlap iff A.start < B.end AND A.end > B.start
  SELECT id, starts_at, ends_at
    INTO v_conflict_id, v_conflict_starts, v_conflict_ends
    FROM public.bookings
   WHERE shop_id = NEW.shop_id
     AND staff_id = NEW.staff_id
     AND status NOT IN ('cancelled', 'no_show')
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND starts_at < NEW.ends_at
     AND ends_at   > NEW.starts_at
   LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'BOOKING_CONFLICT: staff has overlapping booking % from % to %',
      v_conflict_id,
      to_char(v_conflict_starts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(v_conflict_ends   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      USING ERRCODE = 'P0001',
            HINT    = v_conflict_id::text;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_overlapping_staff_bookings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer) RETURNS TABLE("msg_id" bigint, "read_ct" integer, "message" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;


ALTER FUNCTION "public"."read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_customer_last_visit"("_customer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_last timestamptz;
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;

  SELECT MAX(starts_at) INTO v_last
    FROM public.bookings
   WHERE customer_id = _customer_id
     AND status = 'completed';

  UPDATE public.customers
     SET last_visit_at = v_last,
         updated_at = now()
   WHERE id = _customer_id
     AND last_visit_at IS DISTINCT FROM v_last;
END;
$$;


ALTER FUNCTION "public"."recalc_customer_last_visit"("_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_customer_total_spent"("_customer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total bigint := 0;
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0)::bigint INTO v_total
  FROM (
    -- Paid payments tied to this customer's bookings (deposit or full)
    SELECT p.amount_cents AS amount
      FROM public.payments p
      JOIN public.bookings b ON b.id = p.booking_id
     WHERE b.customer_id = _customer_id
       AND p.status = 'paid'

    UNION ALL

    -- Completed bookings without any paid payment row → count booking price
    SELECT b.price_cents AS amount
      FROM public.bookings b
     WHERE b.customer_id = _customer_id
       AND b.status = 'completed'
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.booking_id = b.id AND p.status = 'paid'
       )
  ) s;

  UPDATE public.customers
     SET total_spent_cents = v_total,
         updated_at = now()
   WHERE id = _customer_id;
END;
$$;


ALTER FUNCTION "public"."recalc_customer_total_spent"("_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_can_accept_bookings"("_shop_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan public.subscription_plan;
  v_expires timestamptz;
  v_onboarding jsonb;
  v_failed_at timestamptz;
  v_sub_status text;
BEGIN
  SELECT plan, plan_expires_at, onboarding
    INTO v_plan, v_expires, v_onboarding
    FROM public.shops
   WHERE id = _shop_id;

  IF v_plan IS NULL THEN
    RETURN false;
  END IF;

  -- Trial: blokkeren als verlopen
  IF v_plan = 'trial' THEN
    RETURN v_expires IS NULL OR v_expires > now();
  END IF;

  -- Paid plans: check payment_failed grace period
  v_sub_status := v_onboarding->>'subscription_status';
  v_failed_at := NULLIF(v_onboarding->>'payment_failed_at', '')::timestamptz;

  IF v_sub_status = 'payment_failed' AND v_failed_at IS NOT NULL THEN
    -- Binnen 7 dagen na payment_failed: nog toegestaan (grace)
    -- Daarna: blokkeren tot betaling weer slaagt
    RETURN v_failed_at > (now() - interval '7 days');
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."shop_can_accept_bookings"("_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_customer_no_show_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'no_show' AND NEW.customer_id IS NOT NULL THEN
      UPDATE public.customers SET no_show_count = no_show_count + 1 WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- status changed TO no_show
    IF NEW.status = 'no_show' AND COALESCE(OLD.status::text,'') <> 'no_show' AND NEW.customer_id IS NOT NULL THEN
      UPDATE public.customers SET no_show_count = no_show_count + 1 WHERE id = NEW.customer_id;
    END IF;
    -- status changed AWAY from no_show
    IF OLD.status = 'no_show' AND COALESCE(NEW.status::text,'') <> 'no_show' AND OLD.customer_id IS NOT NULL THEN
      UPDATE public.customers SET no_show_count = GREATEST(no_show_count - 1, 0) WHERE id = OLD.customer_id;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.status = 'no_show' AND OLD.customer_id IS NOT NULL THEN
      UPDATE public.customers SET no_show_count = GREATEST(no_show_count - 1, 0) WHERE id = OLD.customer_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_customer_no_show_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_bookings_recalc_customer_total"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.recalc_customer_total_spent(OLD.customer_id);
    RETURN OLD;
  END IF;

  -- On INSERT or UPDATE: recalc both old and new customer when relevant fields change
  IF (TG_OP = 'UPDATE') AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recalc_customer_total_spent(OLD.customer_id);
  END IF;

  PERFORM public.recalc_customer_total_spent(NEW.customer_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_bookings_recalc_customer_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_bookings_recalc_last_visit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.recalc_customer_last_visit(OLD.customer_id);
    RETURN OLD;
  END IF;

  IF (TG_OP = 'UPDATE') AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recalc_customer_last_visit(OLD.customer_id);
  END IF;

  PERFORM public.recalc_customer_last_visit(NEW.customer_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_bookings_recalc_last_visit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_payments_recalc_customer_total"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_customer uuid;
  v_new_customer uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    SELECT customer_id INTO v_old_customer FROM public.bookings WHERE id = OLD.booking_id;
    PERFORM public.recalc_customer_total_spent(v_old_customer);
    RETURN OLD;
  END IF;

  SELECT customer_id INTO v_new_customer FROM public.bookings WHERE id = NEW.booking_id;

  IF (TG_OP = 'UPDATE') THEN
    IF OLD.booking_id IS DISTINCT FROM NEW.booking_id THEN
      SELECT customer_id INTO v_old_customer FROM public.bookings WHERE id = OLD.booking_id;
      PERFORM public.recalc_customer_total_spent(v_old_customer);
    END IF;
  END IF;

  PERFORM public.recalc_customer_total_spent(v_new_customer);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_payments_recalc_customer_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_shop_subscription_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.subscription_status NOT IN ('active','trial','expired','cancelled','paused','payment_failed') THEN
    RAISE EXCEPTION 'invalid subscription_status: %', NEW.subscription_status;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_shop_subscription_status"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "actor_user_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."activity_log" REPLICA IDENTITY FULL;


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "label" "text",
    "expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(24), 'hex'::"text") NOT NULL,
    "invited_by" "uuid",
    "invited_by_email" "text",
    "accepted_user_id" "uuid",
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_login_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "role" "text",
    "success" boolean DEFAULT true NOT NULL,
    "failure_reason" "text",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_login_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "demo_mode_enabled" boolean DEFAULT true NOT NULL,
    "demo_logins_enabled" boolean DEFAULT true NOT NULL,
    "public_booking_on_demo_shops_enabled" boolean DEFAULT true NOT NULL,
    "seeded_demo_data_visible" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_settings_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "service_id" "uuid",
    "staff_id" "uuid",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "public"."booking_status" DEFAULT 'pending'::"public"."booking_status" NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "deposit_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmation_sent_at" timestamp with time zone,
    "reminder_24h_sent_at" timestamp with time zone,
    "reminder_2h_sent_at" timestamp with time zone,
    "followup_sent_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."bookings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "notes" "text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "total_spent_cents" integer DEFAULT 0 NOT NULL,
    "last_visit_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "no_show_count" integer DEFAULT 0 NOT NULL,
    "requires_deposit" boolean DEFAULT false NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "import_source" "text",
    "imported_at" timestamp with time zone
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_send_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "text",
    "template_name" "text" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "status" "text" NOT NULL,
    "error_message" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_send_log_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'suppressed'::"text", 'failed'::"text", 'bounced'::"text", 'complained'::"text", 'dlq'::"text"])))
);


ALTER TABLE "public"."email_send_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_send_state" (
    "id" integer DEFAULT 1 NOT NULL,
    "retry_after_until" timestamp with time zone,
    "batch_size" integer DEFAULT 10 NOT NULL,
    "send_delay_ms" integer DEFAULT 200 NOT NULL,
    "auth_email_ttl_minutes" integer DEFAULT 15 NOT NULL,
    "transactional_email_ttl_minutes" integer DEFAULT 60 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_send_state_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."email_send_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_unsubscribe_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_at" timestamp with time zone
);


ALTER TABLE "public"."email_unsubscribe_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "type" "public"."notification_type" DEFAULT 'system'::"public"."notification_type" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "action_url" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "created_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "amount_cents" integer NOT NULL,
    "application_fee_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "status" "public"."payment_status" DEFAULT 'unpaid'::"public"."payment_status" NOT NULL,
    "provider" "text",
    "provider_payment_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_features" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_name" "public"."subscription_plan" NOT NULL,
    "feature_slug" "text" NOT NULL,
    "is_included" boolean DEFAULT false NOT NULL,
    "limit_value" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plan_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_name" "public"."subscription_plan" NOT NULL,
    "monthly_price_cents" integer DEFAULT 0 NOT NULL,
    "platform_fee_bps" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_fee_cents" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."plan_pricing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_billing_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "mode" "text" DEFAULT 'test'::"text" NOT NULL,
    "webhook_url_override" "text",
    "expects_client_id" boolean DEFAULT false NOT NULL,
    "expects_client_secret" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "last_health_status" "text",
    "last_health_message" "text",
    "last_health_at" timestamp with time zone,
    "last_health_mode" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "platform_billing_config_mode_check" CHECK (("mode" = ANY (ARRAY['test'::"text", 'live'::"text"]))),
    CONSTRAINT "platform_billing_config_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."platform_billing_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "legal_consent" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "admin_last_seen_activity_at" timestamp with time zone,
    "last_login_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "duration_minutes" integer DEFAULT 30 NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "deposit_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_automations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "confirmation_enabled" boolean DEFAULT true NOT NULL,
    "reminder_24h_enabled" boolean DEFAULT true NOT NULL,
    "reminder_2h_enabled" boolean DEFAULT true NOT NULL,
    "followup_enabled" boolean DEFAULT false NOT NULL,
    "followup_delay_minutes" integer DEFAULT 120 NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reminder_sms_enabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."shop_automations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_feature_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "feature_slug" "text" NOT NULL,
    "is_included" boolean DEFAULT true NOT NULL,
    "limit_value" integer,
    "expires_at" timestamp with time zone,
    "reason" "text",
    "granted_by" "uuid",
    "granted_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_feature_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_payment_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'mollie'::"text" NOT NULL,
    "provider_account_id" "text",
    "connection_status" "text" DEFAULT 'not_connected'::"text" NOT NULL,
    "onboarding_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "application_fee_enabled" boolean DEFAULT true NOT NULL,
    "application_fee_percent" numeric(5,2) DEFAULT 2.00 NOT NULL,
    "payment_methods_enabled" "jsonb" DEFAULT '["ideal", "creditcard", "bancontact"]'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "connected_at" timestamp with time zone,
    "disconnected_at" timestamp with time zone,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_payment_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_sms_credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "total_purchased" integer DEFAULT 0 NOT NULL,
    "total_used" integer DEFAULT 0 NOT NULL,
    "free_credits_granted" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shop_sms_credits_balance_nonneg" CHECK (("balance" >= 0))
);


ALTER TABLE "public"."shop_sms_credits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "business_hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "branding" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "public"."shop_status" DEFAULT 'pending'::"public"."shop_status" NOT NULL,
    "plan" "public"."subscription_plan" DEFAULT 'trial'::"public"."subscription_plan" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_deposit_percent" integer DEFAULT 0 NOT NULL,
    "onboarding" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_demo" boolean DEFAULT false NOT NULL,
    "plan_expires_at" timestamp with time zone,
    "plan_billing_cycle" "text",
    "admin_notes" "text",
    "policy_accepted_at" timestamp with time zone,
    "policy_version" "text",
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "platform_fee_bps_override" integer,
    "next_billing_at" timestamp with time zone,
    "mollie_subscription_id" "text",
    "subscription_notes" "text",
    "category" "text",
    "booking_fee_cents_override" integer
);


ALTER TABLE "public"."shops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sms_send_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "customer_id" "uuid",
    "phone" "text" NOT NULL,
    "message" "text" NOT NULL,
    "template" "text" DEFAULT 'reminder'::"text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "provider" "text",
    "provider_message_id" "text",
    "error_message" "text",
    "credits_used" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sms_send_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "avatar_url" "text",
    "working_hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_services" (
    "staff_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL
);


ALTER TABLE "public"."staff_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppressed_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "suppressed_emails_reason_check" CHECK (("reason" = ANY (ARRAY['unsubscribe'::"text", 'bounce'::"text", 'complaint'::"text"])))
);


ALTER TABLE "public"."suppressed_emails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "shop_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "label" "text",
    "expires_at" timestamp with time zone,
    "disabled_at" timestamp with time zone,
    "invited_by" "uuid"
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_invites"
    ADD CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_login_log"
    ADD CONSTRAINT "admin_login_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_send_state"
    ADD CONSTRAINT "email_send_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_unsubscribe_tokens"
    ADD CONSTRAINT "email_unsubscribe_tokens_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."email_unsubscribe_tokens"
    ADD CONSTRAINT "email_unsubscribe_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_unsubscribe_tokens"
    ADD CONSTRAINT "email_unsubscribe_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_plan_name_feature_slug_key" UNIQUE ("plan_name", "feature_slug");



ALTER TABLE ONLY "public"."plan_pricing"
    ADD CONSTRAINT "plan_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_pricing"
    ADD CONSTRAINT "plan_pricing_plan_name_key" UNIQUE ("plan_name");



ALTER TABLE ONLY "public"."platform_billing_config"
    ADD CONSTRAINT "platform_billing_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_automations"
    ADD CONSTRAINT "shop_automations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_automations"
    ADD CONSTRAINT "shop_automations_shop_unique" UNIQUE ("shop_id");



ALTER TABLE ONLY "public"."shop_feature_overrides"
    ADD CONSTRAINT "shop_feature_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_feature_overrides"
    ADD CONSTRAINT "shop_feature_overrides_shop_id_feature_slug_key" UNIQUE ("shop_id", "feature_slug");



ALTER TABLE ONLY "public"."shop_payment_providers"
    ADD CONSTRAINT "shop_payment_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_payment_providers"
    ADD CONSTRAINT "shop_payment_providers_shop_id_provider_key" UNIQUE ("shop_id", "provider");



ALTER TABLE ONLY "public"."shop_sms_credits"
    ADD CONSTRAINT "shop_sms_credits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_sms_credits"
    ADD CONSTRAINT "shop_sms_credits_shop_id_key" UNIQUE ("shop_id");



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."sms_send_log"
    ADD CONSTRAINT "sms_send_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_services"
    ADD CONSTRAINT "staff_services_pkey" PRIMARY KEY ("staff_id", "service_id");



ALTER TABLE ONLY "public"."suppressed_emails"
    ADD CONSTRAINT "suppressed_emails_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."suppressed_emails"
    ADD CONSTRAINT "suppressed_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_shop_id_key" UNIQUE ("user_id", "role", "shop_id");



CREATE INDEX "activity_log_created_at_idx" ON "public"."activity_log" USING "btree" ("created_at" DESC);



CREATE INDEX "activity_log_shop_id_idx" ON "public"."activity_log" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "admin_invites_email_idx" ON "public"."admin_invites" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "admin_invites_token_key" ON "public"."admin_invites" USING "btree" ("token");



CREATE INDEX "admin_login_log_created_at_idx" ON "public"."admin_login_log" USING "btree" ("created_at" DESC);



CREATE INDEX "admin_login_log_user_idx" ON "public"."admin_login_log" USING "btree" ("user_id");



CREATE INDEX "idx_bookings_customer" ON "public"."bookings" USING "btree" ("customer_id");



CREATE INDEX "idx_bookings_shop_starts" ON "public"."bookings" USING "btree" ("shop_id", "starts_at");



CREATE INDEX "idx_bookings_staff" ON "public"."bookings" USING "btree" ("staff_id");



CREATE INDEX "idx_bookings_staff_time" ON "public"."bookings" USING "btree" ("shop_id", "staff_id", "starts_at", "ends_at") WHERE ("status" <> ALL (ARRAY['cancelled'::"public"."booking_status", 'no_show'::"public"."booking_status"]));



CREATE INDEX "idx_customers_shop" ON "public"."customers" USING "btree" ("shop_id");



CREATE INDEX "idx_customers_shop_import_source" ON "public"."customers" USING "btree" ("shop_id", "import_source") WHERE ("import_source" IS NOT NULL);



CREATE INDEX "idx_customers_tags" ON "public"."customers" USING "gin" ("tags");



CREATE INDEX "idx_email_send_log_created" ON "public"."email_send_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_email_send_log_message" ON "public"."email_send_log" USING "btree" ("message_id");



CREATE UNIQUE INDEX "idx_email_send_log_message_sent_unique" ON "public"."email_send_log" USING "btree" ("message_id") WHERE ("status" = 'sent'::"text");



CREATE INDEX "idx_email_send_log_recipient" ON "public"."email_send_log" USING "btree" ("recipient_email");



CREATE INDEX "idx_notifications_shop_created" ON "public"."notifications" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "idx_notifications_shop_unread" ON "public"."notifications" USING "btree" ("shop_id") WHERE ("is_read" = false);



CREATE INDEX "idx_payments_booking" ON "public"."payments" USING "btree" ("booking_id");



CREATE INDEX "idx_payments_provider_payment_id" ON "public"."payments" USING "btree" ("provider_payment_id");



CREATE INDEX "idx_payments_provider_shop" ON "public"."payments" USING "btree" ("provider", "shop_id");



CREATE INDEX "idx_payments_shop" ON "public"."payments" USING "btree" ("shop_id");



CREATE INDEX "idx_plan_features_plan" ON "public"."plan_features" USING "btree" ("plan_name");



CREATE INDEX "idx_services_shop" ON "public"."services" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_feature_overrides_shop_feature" ON "public"."shop_feature_overrides" USING "btree" ("shop_id", "feature_slug");



CREATE INDEX "idx_shop_payment_providers_shop" ON "public"."shop_payment_providers" USING "btree" ("shop_id");



CREATE INDEX "idx_shops_owner" ON "public"."shops" USING "btree" ("owner_id");



CREATE INDEX "idx_shops_policy_accepted_at" ON "public"."shops" USING "btree" ("policy_accepted_at");



CREATE INDEX "idx_staff_shop" ON "public"."staff" USING "btree" ("shop_id");



CREATE INDEX "idx_suppressed_emails_email" ON "public"."suppressed_emails" USING "btree" ("email");



CREATE INDEX "idx_unsubscribe_tokens_token" ON "public"."email_unsubscribe_tokens" USING "btree" ("token");



CREATE INDEX "idx_user_roles_shop" ON "public"."user_roles" USING "btree" ("shop_id");



CREATE INDEX "idx_user_roles_user" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "profiles_last_login_at_idx" ON "public"."profiles" USING "btree" ("last_login_at" DESC);



CREATE INDEX "shops_subscription_status_idx" ON "public"."shops" USING "btree" ("subscription_status");



CREATE INDEX "sms_send_log_booking_id_idx" ON "public"."sms_send_log" USING "btree" ("booking_id");



CREATE INDEX "sms_send_log_shop_id_idx" ON "public"."sms_send_log" USING "btree" ("shop_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "bookings_enforce_staff_hours" BEFORE INSERT OR UPDATE OF "starts_at", "ends_at", "staff_id", "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_booking_outside_staff_hours"();



CREATE OR REPLACE TRIGGER "bookings_recalc_customer_total_trg" AFTER INSERT OR DELETE OR UPDATE OF "status", "price_cents", "customer_id" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."trg_bookings_recalc_customer_total"();



CREATE OR REPLACE TRIGGER "bookings_recalc_last_visit_trg" AFTER INSERT OR DELETE OR UPDATE OF "status", "starts_at", "customer_id" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."trg_bookings_recalc_last_visit"();



CREATE OR REPLACE TRIGGER "bookings_sync_no_show_count" AFTER INSERT OR DELETE OR UPDATE OF "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."sync_customer_no_show_count"();



CREATE OR REPLACE TRIGGER "notify_booking_created" AFTER INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_booking_change"();



CREATE OR REPLACE TRIGGER "notify_booking_status_changed" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_booking_change"();



CREATE OR REPLACE TRIGGER "on_shop_created_grant_sms_credits" AFTER INSERT ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_shop_sms_credits"();



CREATE OR REPLACE TRIGGER "payments_recalc_customer_total_trg" AFTER INSERT OR DELETE OR UPDATE OF "status", "amount_cents", "booking_id" ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_payments_recalc_customer_total"();



CREATE OR REPLACE TRIGGER "plan_features_set_updated_at" BEFORE UPDATE ON "public"."plan_features" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "prevent_overlapping_staff_bookings_trg" BEFORE INSERT OR UPDATE OF "starts_at", "ends_at", "staff_id", "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_overlapping_staff_bookings"();



CREATE OR REPLACE TRIGGER "set_trial_expiry_on_insert" BEFORE INSERT ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_shop_trial"();



CREATE OR REPLACE TRIGGER "shop_sms_credits_updated_at" BEFORE UPDATE ON "public"."shop_sms_credits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_app_settings_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_plan_pricing_updated_at" BEFORE UPDATE ON "public"."plan_pricing" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_shop_automations_updated_at" BEFORE UPDATE ON "public"."shop_automations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_shop_feature_overrides_updated_at" BEFORE UPDATE ON "public"."shop_feature_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_shop_payment_providers_updated_at" BEFORE UPDATE ON "public"."shop_payment_providers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_shops_create_automations" AFTER INSERT ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_shop_automations"();



CREATE OR REPLACE TRIGGER "trg_shops_updated_at" BEFORE UPDATE ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_staff_updated_at" BEFORE UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_welcome_shop_owner" AFTER INSERT ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."notify_welcome_shop_owner"();



CREATE OR REPLACE TRIGGER "update_platform_billing_config_updated_at" BEFORE UPDATE ON "public"."platform_billing_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_shop_subscription_status_trg" BEFORE INSERT OR UPDATE OF "subscription_status" ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."validate_shop_subscription_status"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_automations"
    ADD CONSTRAINT "shop_automations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_feature_overrides"
    ADD CONSTRAINT "shop_feature_overrides_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_payment_providers"
    ADD CONSTRAINT "shop_payment_providers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."staff_services"
    ADD CONSTRAINT "staff_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_services"
    ADD CONSTRAINT "staff_services_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Service role can insert send log" ON "public"."email_send_log" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can insert suppressed emails" ON "public"."suppressed_emails" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can insert tokens" ON "public"."email_unsubscribe_tokens" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage send state" ON "public"."email_send_state" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can mark tokens as used" ON "public"."email_unsubscribe_tokens" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can read send log" ON "public"."email_send_log" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can read suppressed emails" ON "public"."suppressed_emails" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can read tokens" ON "public"."email_unsubscribe_tokens" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can update send log" ON "public"."email_send_log" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_log_admin_select" ON "public"."activity_log" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "activity_log_insert" ON "public"."activity_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (("shop_id" IS NOT NULL) AND "public"."is_shop_owner"("auth"."uid"(), "shop_id"))));



CREATE POLICY "activity_log_owner_select" ON "public"."activity_log" FOR SELECT TO "authenticated" USING ((("shop_id" IS NOT NULL) AND "public"."is_shop_owner"("auth"."uid"(), "shop_id")));



ALTER TABLE "public"."admin_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_invites_admin_all" ON "public"."admin_invites" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



ALTER TABLE "public"."admin_login_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_login_log_admin_select" ON "public"."admin_login_log" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "admin_login_log_self_insert" ON "public"."admin_login_log" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("user_id" IS NULL) OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_admin_all" ON "public"."app_settings" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_public_insert" ON "public"."bookings" FOR INSERT TO "authenticated", "anon" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "bookings"."shop_id") AND ("shops"."status" = 'active'::"public"."shop_status")))) AND "public"."shop_can_accept_bookings"("shop_id")));



CREATE POLICY "bookings_public_read_active" ON "public"."bookings" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."shops" "s"
  WHERE (("s"."id" = "bookings"."shop_id") AND ("s"."status" = 'active'::"public"."shop_status")))));



CREATE POLICY "bookings_shop_delete" ON "public"."bookings" FOR DELETE TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



CREATE POLICY "bookings_shop_insert" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_shop_access"("auth"."uid"(), "shop_id") AND "public"."shop_can_accept_bookings"("shop_id")));



CREATE POLICY "bookings_shop_read" ON "public"."bookings" FOR SELECT TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



CREATE POLICY "bookings_shop_update" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id")) WITH CHECK ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_public_insert" ON "public"."customers" FOR INSERT TO "authenticated", "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "customers"."shop_id") AND ("shops"."status" = 'active'::"public"."shop_status")))));



CREATE POLICY "customers_public_select_by_shop" ON "public"."customers" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "customers"."shop_id") AND ("shops"."status" = 'active'::"public"."shop_status")))));



CREATE POLICY "customers_shop_access" ON "public"."customers" TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id")) WITH CHECK ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."email_send_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_send_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_unsubscribe_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_admin_delete_all" ON "public"."notifications" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "notifications_admin_or_owner_insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR "public"."is_shop_owner"("auth"."uid"(), "shop_id")));



CREATE POLICY "notifications_admin_select_all" ON "public"."notifications" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "notifications_owner_delete" ON "public"."notifications" FOR DELETE TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



CREATE POLICY "notifications_owner_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "shop_id")) WITH CHECK ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



CREATE POLICY "notifications_shop_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



CREATE POLICY "overrides_admin_all" ON "public"."shop_feature_overrides" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "overrides_owner_select" ON "public"."shop_feature_overrides" FOR SELECT TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_public_insert" ON "public"."payments" FOR INSERT TO "authenticated", "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "payments"."shop_id") AND ("shops"."status" = 'active'::"public"."shop_status")))));



CREATE POLICY "payments_public_read_active" ON "public"."payments" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."shops" "s"
  WHERE (("s"."id" = "payments"."shop_id") AND ("s"."status" = 'active'::"public"."shop_status")))));



CREATE POLICY "payments_shop_access" ON "public"."payments" TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id")) WITH CHECK ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."plan_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_features_admin_write" ON "public"."plan_features" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "plan_features_public_read" ON "public"."plan_features" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."plan_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_pricing_admin_write" ON "public"."plan_pricing" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "plan_pricing_public_read" ON "public"."plan_pricing" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."platform_billing_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_billing_config_admin_select" ON "public"."platform_billing_config" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "platform_billing_config_admin_update" ON "public"."platform_billing_config" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_self_or_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"())));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_public_read" ON "public"."services" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."has_shop_access"("auth"."uid"(), "shop_id")));



CREATE POLICY "services_shop_write" ON "public"."services" TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "shop_id")) WITH CHECK ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."shop_automations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_automations_owner_all" ON "public"."shop_automations" TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "shop_id")) WITH CHECK ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."shop_feature_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_payment_providers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_payment_providers_owner_delete" ON "public"."shop_payment_providers" FOR DELETE TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



CREATE POLICY "shop_payment_providers_owner_insert" ON "public"."shop_payment_providers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



CREATE POLICY "shop_payment_providers_owner_select" ON "public"."shop_payment_providers" FOR SELECT TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



CREATE POLICY "shop_payment_providers_owner_update" ON "public"."shop_payment_providers" FOR UPDATE TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "shop_id")) WITH CHECK ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."shop_sms_credits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shops_admin_delete" ON "public"."shops" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "shops_owner_insert" ON "public"."shops" FOR INSERT TO "authenticated" WITH CHECK ((("owner_id" = "auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"())));



CREATE POLICY "shops_owner_update" ON "public"."shops" FOR UPDATE TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "id")) WITH CHECK ("public"."is_shop_owner"("auth"."uid"(), "id"));



CREATE POLICY "shops_public_read_active" ON "public"."shops" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'active'::"public"."shop_status") OR "public"."has_shop_access"("auth"."uid"(), "id")));



CREATE POLICY "sms_credits_admin_all" ON "public"."shop_sms_credits" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "sms_credits_shop_select" ON "public"."shop_sms_credits" FOR SELECT TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."sms_send_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sms_send_log_admin_all" ON "public"."sms_send_log" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "sms_send_log_service_insert" ON "public"."sms_send_log" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "sms_send_log_shop_select" ON "public"."sms_send_log" FOR SELECT TO "authenticated" USING ("public"."has_shop_access"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_public_read" ON "public"."staff" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."has_shop_access"("auth"."uid"(), "shop_id")));



ALTER TABLE "public"."staff_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_services_read" ON "public"."staff_services" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "staff_services_write" ON "public"."staff_services" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_services"."staff_id") AND "public"."is_shop_owner"("auth"."uid"(), "s"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_services"."staff_id") AND "public"."is_shop_owner"("auth"."uid"(), "s"."shop_id")))));



CREATE POLICY "staff_shop_write" ON "public"."staff" TO "authenticated" USING ("public"."is_shop_owner"("auth"."uid"(), "shop_id")) WITH CHECK ("public"."is_shop_owner"("auth"."uid"(), "shop_id"));



ALTER TABLE "public"."suppressed_emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_admin_all" ON "public"."user_roles" TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "user_roles_select_own_or_admin" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"())));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_mollie_token_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."_mollie_token_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_mollie_token_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_broadcast_notification"("_title" "text", "_message" "text", "_type" "public"."notification_type", "_action_url" "text", "_shop_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_broadcast_notification"("_title" "text", "_message" "text", "_type" "public"."notification_type", "_action_url" "text", "_shop_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_broadcast_notification"("_title" "text", "_message" "text", "_type" "public"."notification_type", "_action_url" "text", "_shop_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_sms_credit"("_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_sms_credit"("_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_sms_credit"("_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrypt_mollie_token"("ciphertext" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."decrypt_mollie_token"("ciphertext" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrypt_mollie_token"("ciphertext" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_email"("queue_name" "text", "message_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_email"("queue_name" "text", "message_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_email"("queue_name" "text", "message_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."encrypt_mollie_token"("plaintext" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."encrypt_mollie_token"("plaintext" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."encrypt_mollie_token"("plaintext" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_email"("queue_name" "text", "payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_email"("queue_name" "text", "payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_email"("queue_name" "text", "payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_default_shop_id"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_default_shop_id"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_default_shop_id"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_app_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_app_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_app_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shop_feature_access"("_shop_id" "uuid", "_feature_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shop_feature_access"("_shop_id" "uuid", "_feature_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shop_feature_access"("_shop_id" "uuid", "_feature_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_shop_automations"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_shop_automations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_shop_automations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_shop_sms_credits"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_shop_sms_credits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_shop_sms_credits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_shop_trial"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_shop_trial"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_shop_trial"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_shop_access"("_user_id" "uuid", "_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_shop_access"("_user_id" "uuid", "_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_shop_access"("_user_id" "uuid", "_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_writer"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_writer"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_writer"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_role_active"("_disabled_at" timestamp with time zone, "_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."is_role_active"("_disabled_at" timestamp with time zone, "_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_role_active"("_disabled_at" timestamp with time zone, "_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_shop_owner"("_user_id" "uuid", "_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_shop_owner"("_user_id" "uuid", "_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_shop_owner"("_user_id" "uuid", "_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_booking_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_booking_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_booking_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_welcome_shop_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_welcome_shop_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_welcome_shop_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_booking_outside_staff_hours"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_booking_outside_staff_hours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_booking_outside_staff_hours"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_overlapping_staff_bookings"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_overlapping_staff_bookings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_overlapping_staff_bookings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_customer_last_visit"("_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_customer_last_visit"("_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_customer_last_visit"("_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_customer_total_spent"("_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_customer_total_spent"("_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_customer_total_spent"("_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."shop_can_accept_bookings"("_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shop_can_accept_bookings"("_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_can_accept_bookings"("_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_customer_no_show_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_customer_no_show_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_customer_no_show_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_bookings_recalc_customer_total"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_bookings_recalc_customer_total"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_bookings_recalc_customer_total"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_bookings_recalc_last_visit"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_bookings_recalc_last_visit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_bookings_recalc_last_visit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_payments_recalc_customer_total"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_payments_recalc_customer_total"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_payments_recalc_customer_total"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_shop_subscription_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_shop_subscription_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_shop_subscription_status"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."admin_invites" TO "anon";
GRANT ALL ON TABLE "public"."admin_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_invites" TO "service_role";



GRANT ALL ON TABLE "public"."admin_login_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_login_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_login_log" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."email_send_log" TO "anon";
GRANT ALL ON TABLE "public"."email_send_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_send_log" TO "service_role";



GRANT ALL ON TABLE "public"."email_send_state" TO "anon";
GRANT ALL ON TABLE "public"."email_send_state" TO "authenticated";
GRANT ALL ON TABLE "public"."email_send_state" TO "service_role";



GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "anon";
GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."plan_features" TO "anon";
GRANT ALL ON TABLE "public"."plan_features" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_features" TO "service_role";



GRANT ALL ON TABLE "public"."plan_pricing" TO "anon";
GRANT ALL ON TABLE "public"."plan_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."platform_billing_config" TO "anon";
GRANT ALL ON TABLE "public"."platform_billing_config" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_billing_config" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."shop_automations" TO "anon";
GRANT ALL ON TABLE "public"."shop_automations" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_automations" TO "service_role";



GRANT ALL ON TABLE "public"."shop_feature_overrides" TO "anon";
GRANT ALL ON TABLE "public"."shop_feature_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_feature_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."shop_payment_providers" TO "anon";
GRANT ALL ON TABLE "public"."shop_payment_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_payment_providers" TO "service_role";



GRANT ALL ON TABLE "public"."shop_sms_credits" TO "anon";
GRANT ALL ON TABLE "public"."shop_sms_credits" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_sms_credits" TO "service_role";



GRANT ALL ON TABLE "public"."shops" TO "anon";
GRANT ALL ON TABLE "public"."shops" TO "authenticated";
GRANT ALL ON TABLE "public"."shops" TO "service_role";



GRANT ALL ON TABLE "public"."sms_send_log" TO "anon";
GRANT ALL ON TABLE "public"."sms_send_log" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_send_log" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."staff_services" TO "anon";
GRANT ALL ON TABLE "public"."staff_services" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_services" TO "service_role";



GRANT ALL ON TABLE "public"."suppressed_emails" TO "anon";
GRANT ALL ON TABLE "public"."suppressed_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."suppressed_emails" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







