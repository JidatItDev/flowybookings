CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store the symmetric key in Vault (idempotent, 32 random bytes hex-encoded).
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'mollie_token_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'mollie_token_key',
      'Symmetric key (hex) for encrypting Mollie Connect tokens'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._mollie_token_key()
RETURNS bytea
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault
AS $$
  SELECT decode(decrypted_secret, 'hex')
  FROM vault.decrypted_secrets WHERE name = 'mollie_token_key' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._mollie_token_key() FROM PUBLIC, anon, authenticated;

-- Encrypt: returns base64( iv(16) || ciphertext ). NULL/'' input → NULL.
CREATE OR REPLACE FUNCTION public.encrypt_mollie_token(plaintext text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

-- Cron: refresh Mollie Connect tokens every 4 hours.
DO $$ BEGIN
  PERFORM cron.unschedule('mollie-connect-refresh-tokens');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'mollie-connect-refresh-tokens',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://id-preview--fee77681-0a63-4676-9809-c529e70e9210.lovable.app/hooks/mollie-refresh-tokens',
    headers := '{"Content-Type":"application/json","Lovable-Context":"cron","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsdnZiYm5sc2Z6bXRvb2d3dHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTM2NTIsImV4cCI6MjA5MjE4OTY1Mn0.ra7Z31Cb5ZNEson2dyzNIhYOfSXkSHfT-FS-WBjA2UA"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);