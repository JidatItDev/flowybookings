-- Tracks whether a booking was created by the customer (public booking flow)
-- or the shop owner (manual booking) — surfaced as a badge on the calendar's
-- detail sheet. Nullable: a no-deposit booking with no payment row is
-- genuinely ambiguous between the two from the data alone, so it's left NULL
-- rather than guessed (the app shows no badge in that case).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS created_via text CHECK (created_via IN ('online', 'manual'));

-- Backfill existing rows with the same best-effort heuristic the app uses:
-- any payment row proves 'online' (only the public checkout flow ever
-- creates one); no payment row but a deposit proves 'manual' (an online
-- deposit-service booking would always have created a payment).
UPDATE public.bookings b
SET created_via = 'online'
WHERE b.created_via IS NULL
  AND EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id);

UPDATE public.bookings b
SET created_via = 'manual'
WHERE b.created_via IS NULL
  AND b.deposit_cents > 0
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id);
