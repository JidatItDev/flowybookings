-- Ensure pg_net is available for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trigger function: fires after a new shop is inserted, sends an HTTP POST
-- to /hooks/welcome-shop-owner with the new shop_id. Failures are swallowed
-- so shop creation never fails because of email.
CREATE OR REPLACE FUNCTION public.notify_welcome_shop_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

DROP TRIGGER IF EXISTS trg_welcome_shop_owner ON public.shops;
CREATE TRIGGER trg_welcome_shop_owner
AFTER INSERT ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.notify_welcome_shop_owner();