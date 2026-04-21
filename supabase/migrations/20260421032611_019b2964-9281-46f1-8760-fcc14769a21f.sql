-- Auto-maintain customers.total_spent_cents
-- Sources of truth:
--   1) payments with status='paid' linked to a booking (customer comes from the booking)
--   2) bookings with status='completed' that have NO paid payment row
--      (covers cash/in-person/walk-in revenue tracked only on the booking itself)
--
-- We recompute the customer's total from scratch on any relevant change. This is
-- O(few rows per customer) and keeps the value consistent without drift.

CREATE OR REPLACE FUNCTION public.recalc_customer_total_spent(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Trigger function: payments → recalc the affected customer(s)
CREATE OR REPLACE FUNCTION public.trg_payments_recalc_customer_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS payments_recalc_customer_total_trg ON public.payments;
CREATE TRIGGER payments_recalc_customer_total_trg
AFTER INSERT OR UPDATE OF status, amount_cents, booking_id OR DELETE
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_payments_recalc_customer_total();

-- Trigger function: bookings → recalc when status/price/customer changes
CREATE OR REPLACE FUNCTION public.trg_bookings_recalc_customer_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS bookings_recalc_customer_total_trg ON public.bookings;
CREATE TRIGGER bookings_recalc_customer_total_trg
AFTER INSERT OR UPDATE OF status, price_cents, customer_id OR DELETE
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_bookings_recalc_customer_total();

-- Backfill: recompute total_spent_cents for every existing customer
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.customers LOOP
    PERFORM public.recalc_customer_total_spent(r.id);
  END LOOP;
END $$;