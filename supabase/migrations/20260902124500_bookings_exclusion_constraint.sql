-- supabase/migrations/20260902124500_bookings_exclusion_constraint.sql
-- Real DB-level double-booking guarantee. The existing
-- prevent_overlapping_staff_bookings trigger (SELECT-then-RAISE) is racy under
-- true concurrency — two simultaneous transactions can both pass its check
-- before either commits. An exclusion constraint is enforced via the same
-- index-insertion mechanism as a unique constraint, so it correctly serializes
-- concurrent inserts. The trigger stays in place (nice in-transaction error
-- message for the common non-race case); this constraint is the backstop.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap_excl
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (staff_id IS NOT NULL AND status IN ('pending', 'confirmed'));
