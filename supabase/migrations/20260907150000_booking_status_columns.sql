-- Columns backing the shop-owner booking lifecycle (Confirm/Cancel/Reschedule/
-- No-show/Completed). Cancellation always requires a free-text reason and is
-- never reversible — see docs/adr/0001-cancellation-and-refund-are-independent.md.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
