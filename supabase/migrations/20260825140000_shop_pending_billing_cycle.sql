-- Billing cycle to apply alongside pending_plan when a scheduled change
-- lands (billing-expiry.ts, at pending_plan_effective_at). Needed so a
-- same-tier cycle switch (e.g. yearly -> monthly) can be scheduled the same
-- way a tier downgrade already is — pending_plan alone can't represent "no
-- tier change, just a cycle change" cleanly since it would equal the
-- current plan. Null means "keep whatever plan_billing_cycle already is" —
-- kept for backward compatibility with any pending downgrade rows written
-- before this column existed.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS pending_billing_cycle text
  CHECK (pending_billing_cycle IS NULL OR pending_billing_cycle IN ('monthly', 'yearly'));

COMMENT ON COLUMN public.shops.pending_billing_cycle IS
  'Billing cycle to apply alongside pending_plan at pending_plan_effective_at. Null keeps the current plan_billing_cycle.';
