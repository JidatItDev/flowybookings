-- 1) Add reminder_sms_enabled toggle to shop_automations
ALTER TABLE public.shop_automations
  ADD COLUMN IF NOT EXISTS reminder_sms_enabled boolean NOT NULL DEFAULT false;

-- 2) shop_sms_credits table
CREATE TABLE IF NOT EXISTS public.shop_sms_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  total_used integer NOT NULL DEFAULT 0,
  free_credits_granted integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_sms_credits_balance_nonneg CHECK (balance >= 0)
);

ALTER TABLE public.shop_sms_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_credits_shop_select"
  ON public.shop_sms_credits FOR SELECT
  TO authenticated
  USING (has_shop_access(auth.uid(), shop_id));

CREATE POLICY "sms_credits_admin_all"
  ON public.shop_sms_credits FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER shop_sms_credits_updated_at
  BEFORE UPDATE ON public.shop_sms_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) sms_send_log table
CREATE TABLE IF NOT EXISTS public.sms_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  booking_id uuid,
  customer_id uuid,
  phone text NOT NULL,
  message text NOT NULL,
  template text NOT NULL DEFAULT 'reminder',
  status text NOT NULL DEFAULT 'queued', -- queued | sent | failed | skipped_no_credits
  provider text,
  provider_message_id text,
  error_message text,
  credits_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_send_log_shop_id_idx ON public.sms_send_log(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_send_log_booking_id_idx ON public.sms_send_log(booking_id);

ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_send_log_shop_select"
  ON public.sms_send_log FOR SELECT
  TO authenticated
  USING (has_shop_access(auth.uid(), shop_id));

CREATE POLICY "sms_send_log_admin_all"
  ON public.sms_send_log FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "sms_send_log_service_insert"
  ON public.sms_send_log FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

-- 4) Helper: atomically consume 1 credit (returns true if consumed)
CREATE OR REPLACE FUNCTION public.consume_sms_credit(_shop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 5) Trigger: grant 10 free credits on new shop
CREATE OR REPLACE FUNCTION public.handle_new_shop_sms_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.shop_sms_credits (shop_id, balance, free_credits_granted)
  VALUES (NEW.id, 10, 10)
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_shop_created_grant_sms_credits ON public.shops;
CREATE TRIGGER on_shop_created_grant_sms_credits
  AFTER INSERT ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_shop_sms_credits();

-- 6) Backfill: existing shops get 10 free credits (one-time)
INSERT INTO public.shop_sms_credits (shop_id, balance, free_credits_granted)
SELECT s.id, 10, 10
FROM public.shops s
LEFT JOIN public.shop_sms_credits c ON c.shop_id = s.id
WHERE c.id IS NULL
ON CONFLICT (shop_id) DO NOTHING;