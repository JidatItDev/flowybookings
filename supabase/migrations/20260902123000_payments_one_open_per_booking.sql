-- supabase/migrations/20260902123000_payments_one_open_per_booking.sql
-- Idempotency guarantee: at most one *open* (unpaid) payment per booking.
-- Prevents a double-click or a client retry on POST /api/bookings/checkout
-- from creating two live Mollie payments for the same booking.

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_open_per_booking_uniq
  ON public.payments (booking_id)
  WHERE status = 'unpaid' AND booking_id IS NOT NULL;
