-- supabase/migrations/20260902120000_week3_deposit_mode.sql
-- Per-service deposit override toggle. 'custom' = use services.deposit_cents
-- directly (0 = explicitly free). 'default' = compute from the shop's
-- branding.rules.defaultDepositPct at booking time (see deposit-decision.ts).
--
-- Backfill: ALL existing services get 'custom' with their current deposit_cents
-- preserved exactly — zero behavior change for shops already live. Only
-- services created AFTER this migration default to 'default', nudging new
-- setups toward the shop-wide-percent flow.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS deposit_mode TEXT NOT NULL DEFAULT 'default'
    CHECK (deposit_mode IN ('default', 'custom'));

UPDATE public.services SET deposit_mode = 'custom';
