
-- In-app notifications inbox for shops (distinct from shop_automations which controls outbound channel delivery)
CREATE TYPE public.notification_type AS ENUM ('system', 'billing', 'bookings', 'alerts', 'admin');

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL DEFAULT 'system',
  title text NOT NULL,
  message text NOT NULL,
  action_url text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_shop_created ON public.notifications(shop_id, created_at DESC);
CREATE INDEX idx_notifications_shop_unread ON public.notifications(shop_id) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Owners (and super admin) can read/update/delete their shop notifications
CREATE POLICY notifications_shop_select ON public.notifications
  FOR SELECT TO authenticated
  USING (public.has_shop_access(auth.uid(), shop_id));

CREATE POLICY notifications_owner_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id))
  WITH CHECK (public.is_shop_owner(auth.uid(), shop_id));

CREATE POLICY notifications_owner_delete ON public.notifications
  FOR DELETE TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id));

-- Inserts: super admins (broadcast) OR shop owners (manual). Triggers below run as SECURITY DEFINER.
CREATE POLICY notifications_admin_or_owner_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_shop_owner(auth.uid(), shop_id)
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ── Auto-notify on booking insert/cancel ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE TRIGGER notify_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking_change();

CREATE TRIGGER notify_booking_status_changed
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking_change();

-- ── Helper: broadcast to all shops (super admin only) ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  _title text,
  _message text,
  _type public.notification_type DEFAULT 'admin',
  _action_url text DEFAULT NULL,
  _shop_ids uuid[] DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Allow super admins to read all notifications (for admin overview)
CREATE POLICY notifications_admin_select_all ON public.notifications
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY notifications_admin_delete_all ON public.notifications
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));
