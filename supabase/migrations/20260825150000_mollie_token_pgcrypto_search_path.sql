-- Fix: encrypt_mollie_token / decrypt_mollie_token (20260419204751_...sql) set
-- `search_path = public`, but Supabase-managed projects install pgcrypto into
-- the `extensions` schema by default, not `public` — so `CREATE EXTENSION IF
-- NOT EXISTS pgcrypto` in that migration silently no-op'd (already installed
-- elsewhere) and gen_random_bytes/encrypt_iv/decrypt_iv were never resolvable.
-- Discovered live: "function gen_random_bytes(integer) does not exist" when
-- first attempting a real Mollie Connect token encryption.
--
-- Idempotent / safe to re-run. Ensures pgcrypto exists somewhere reachable,
-- then widens both functions' search_path to include `extensions` regardless
-- of which schema it actually landed in.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.encrypt_mollie_token(plaintext text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
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
REVOKE ALL ON FUNCTION public.encrypt_mollie_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_mollie_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.decrypt_mollie_token(ciphertext text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
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
REVOKE ALL ON FUNCTION public.decrypt_mollie_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_mollie_token(text) TO service_role;
