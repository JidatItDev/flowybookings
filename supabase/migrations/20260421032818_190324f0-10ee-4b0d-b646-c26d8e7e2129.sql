-- Auto-maintain customers.last_visit_at as the starts_at of the most recent
-- 'completed' booking for that customer. NULL when no completed bookings exist.

CREATE OR REPLACE FUNCTION public.recalc_customer_last_visit(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.trg_bookings_recalc_last_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS bookings_recalc_last_visit_trg ON public.bookings;
CREATE TRIGGER bookings_recalc_last_visit_trg
AFTER INSERT OR UPDATE OF status, starts_at, customer_id OR DELETE
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_bookings_recalc_last_visit();

-- Backfill for all existing customers
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.customers LOOP
    PERFORM public.recalc_customer_last_visit(r.id);
  END LOOP;
END $$;