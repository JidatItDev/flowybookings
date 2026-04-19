CREATE OR REPLACE FUNCTION public.consume_sms_credit(_shop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.handle_new_shop_sms_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.shop_sms_credits (shop_id, balance, free_credits_granted)
  VALUES (NEW.id, 10, 10)
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END;
$$;