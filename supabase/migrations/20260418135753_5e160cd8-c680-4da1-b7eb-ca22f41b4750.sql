-- Add no-show tracking + deposit-ready fields
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_deposit boolean NOT NULL DEFAULT false;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS default_deposit_percent integer NOT NULL DEFAULT 0;

-- Trigger to keep no_show_count in sync with bookings.status
CREATE OR REPLACE FUNCTION public.sync_customer_no_show_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS bookings_sync_no_show_count ON public.bookings;
CREATE TRIGGER bookings_sync_no_show_count
AFTER INSERT OR UPDATE OF status OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_no_show_count();

-- Backfill existing data
UPDATE public.customers c SET no_show_count = sub.cnt
FROM (
  SELECT customer_id, COUNT(*)::int AS cnt
  FROM public.bookings
  WHERE status = 'no_show' AND customer_id IS NOT NULL
  GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id;