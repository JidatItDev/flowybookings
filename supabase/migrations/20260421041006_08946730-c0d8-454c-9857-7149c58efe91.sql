-- Enable Realtime broadcasting for the bookings table so the calendar can
-- live-update on INSERT/UPDATE/DELETE without polling. REPLICA IDENTITY FULL
-- is required so DELETE payloads include the old row (we need shop_id + id).
ALTER TABLE public.bookings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bookings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings';
  END IF;
END
$$;