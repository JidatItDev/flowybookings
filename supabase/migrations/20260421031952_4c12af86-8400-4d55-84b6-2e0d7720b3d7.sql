-- Prevent overlapping bookings for the same staff member
CREATE OR REPLACE FUNCTION public.prevent_overlapping_staff_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS prevent_overlapping_staff_bookings_trg ON public.bookings;

CREATE TRIGGER prevent_overlapping_staff_bookings_trg
BEFORE INSERT OR UPDATE OF starts_at, ends_at, staff_id, status
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_overlapping_staff_bookings();

-- Helpful index for the lookup
CREATE INDEX IF NOT EXISTS idx_bookings_staff_time
  ON public.bookings (shop_id, staff_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled', 'no_show');