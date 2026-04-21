-- Trigger: blokkeer booking-inserts/updates die buiten staff working_hours vallen
-- of binnen een ingeplande pauze van die staff member liggen.
-- Werkt op de gestructureerde working_hours-shape (zelfde keys als business_hours):
--   { "mon": { "open":"09:00", "close":"17:00", "closed":false, "breaks":[{"start":"12:00","end":"13:00"}] }, ... }
-- Vrije-tekst (key "hours") wordt genegeerd → géén enforcement (backward compat).

CREATE OR REPLACE FUNCTION public.prevent_booking_outside_staff_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh             jsonb;
  v_tz             text;
  v_local_start    timestamp;
  v_local_end      timestamp;
  v_day_key        text;
  v_day            jsonb;
  v_open           text;
  v_close          text;
  v_closed         boolean;
  v_breaks         jsonb;
  v_break          jsonb;
  v_start_min      int;
  v_end_min        int;
  v_open_min       int;
  v_close_min      int;
  v_break_start    int;
  v_break_end      int;
  v_has_structured boolean := false;
  v_day_keys       text[] := ARRAY['sun','mon','tue','wed','thu','fri','sat'];
BEGIN
  -- Skip als geen staff toegewezen of cancelled/no_show
  IF NEW.staff_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('cancelled', 'no_show') THEN RETURN NEW; END IF;

  -- Haal staff working_hours en shop timezone op
  SELECT s.working_hours, sh.timezone
    INTO v_wh, v_tz
    FROM public.staff s
    JOIN public.shops sh ON sh.id = s.shop_id
   WHERE s.id = NEW.staff_id;

  IF v_wh IS NULL OR jsonb_typeof(v_wh) <> 'object' THEN
    RETURN NEW; -- geen data → niets te enforcen
  END IF;

  -- Check of er überhaupt gestructureerde dag-data bestaat; zo niet → skip (legacy)
  FOR v_day_key IN SELECT unnest(v_day_keys) LOOP
    IF v_wh ? v_day_key AND jsonb_typeof(v_wh -> v_day_key) = 'object' THEN
      v_has_structured := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_has_structured THEN
    RETURN NEW; -- alleen vrije tekst / leeg → geen enforcement
  END IF;

  -- Converteer naar lokale tijd van de shop
  v_tz := COALESCE(NULLIF(v_tz, ''), 'UTC');
  v_local_start := (NEW.starts_at AT TIME ZONE v_tz);
  v_local_end   := (NEW.ends_at   AT TIME ZONE v_tz);

  -- Booking moet binnen één lokale dag vallen
  IF date_trunc('day', v_local_start) <> date_trunc('day', v_local_end - interval '1 microsecond') THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: booking spans multiple days in shop timezone'
      USING ERRCODE = 'P0001';
  END IF;

  -- Bepaal dag-key (0=zo .. 6=za in postgres dow)
  v_day_key := v_day_keys[EXTRACT(DOW FROM v_local_start)::int + 1];
  v_day := v_wh -> v_day_key;

  IF v_day IS NULL OR jsonb_typeof(v_day) <> 'object' THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: staff is not scheduled on % (%)',
      to_char(v_local_start, 'Day'), v_day_key
      USING ERRCODE = 'P0001';
  END IF;

  v_closed := COALESCE((v_day ->> 'closed')::boolean, false);
  IF v_closed THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: staff is off on % (%)',
      to_char(v_local_start, 'Day'), v_day_key
      USING ERRCODE = 'P0001';
  END IF;

  v_open  := v_day ->> 'open';
  v_close := v_day ->> 'close';
  IF v_open IS NULL OR v_close IS NULL THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: staff has no working hours set for % (%)',
      to_char(v_local_start, 'Day'), v_day_key
      USING ERRCODE = 'P0001';
  END IF;

  -- Minuten sinds middernacht
  v_start_min := EXTRACT(HOUR FROM v_local_start)::int * 60 + EXTRACT(MINUTE FROM v_local_start)::int;
  v_end_min   := EXTRACT(HOUR FROM v_local_end)::int   * 60 + EXTRACT(MINUTE FROM v_local_end)::int;
  -- Behandel exact middernacht aan einde als 24:00
  IF v_end_min = 0 AND v_local_end > v_local_start THEN v_end_min := 24 * 60; END IF;

  v_open_min  := (split_part(v_open,  ':', 1))::int * 60 + (split_part(v_open,  ':', 2))::int;
  v_close_min := (split_part(v_close, ':', 1))::int * 60 + (split_part(v_close, ':', 2))::int;

  IF v_start_min < v_open_min OR v_end_min > v_close_min THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS: % is outside staff working hours (%-%)',
      to_char(v_local_start, 'HH24:MI'), v_open, v_close
      USING ERRCODE = 'P0001';
  END IF;

  -- Pauzes: half-open overlap [start,end) met booking [v_start_min,v_end_min)
  v_breaks := v_day -> 'breaks';
  IF v_breaks IS NOT NULL AND jsonb_typeof(v_breaks) = 'array' THEN
    FOR v_break IN SELECT * FROM jsonb_array_elements(v_breaks) LOOP
      IF (v_break ->> 'start') IS NULL OR (v_break ->> 'end') IS NULL THEN CONTINUE; END IF;
      v_break_start := (split_part(v_break ->> 'start', ':', 1))::int * 60 + (split_part(v_break ->> 'start', ':', 2))::int;
      v_break_end   := (split_part(v_break ->> 'end',   ':', 1))::int * 60 + (split_part(v_break ->> 'end',   ':', 2))::int;
      IF v_start_min < v_break_end AND v_end_min > v_break_start THEN
        RAISE EXCEPTION 'BOOKING_DURING_BREAK: booking overlaps staff break (%-%)',
          v_break ->> 'start', v_break ->> 'end'
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_enforce_staff_hours ON public.bookings;
CREATE TRIGGER bookings_enforce_staff_hours
  BEFORE INSERT OR UPDATE OF starts_at, ends_at, staff_id, status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_booking_outside_staff_hours();