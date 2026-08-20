# Task 1 Report: Database migration — billing columns, trigger, booking limit

**Status:** DONE_WITH_CONCERNS  
**Date:** 2026-08-19  
**Migration file:** `supabase/migrations/20260819120000_week2_billing_foundation.sql`

---

## Summary

Created a single migration combining all eight steps from the task brief in order. Migration was **not applied** per human review gate instructions.

---

## Deliverables

| Item | Path |
|---|---|
| Migration SQL | `supabase/migrations/20260819120000_week2_billing_foundation.sql` |

---

## Steps Implemented

### Step 1 — Pending plan columns
- Added `pending_plan` (`subscription_plan` enum) and `pending_plan_effective_at` (`timestamptz`) to `public.shops`
- Added column comments per brief

### Step 2 — Backfill subscription_status
- Backfills from `onboarding->>'subscription_status'` when present
- Falls back to `'active'` for paid plans with future expiry, else `'none'`
- Targets rows where `subscription_status IS NULL OR subscription_status = ''`

### Step 3 — validate_shop_subscription_status
- Added `'none'` to allowed values list (replacing function from migration `20260420080802`)

### Step 4 — Owner billing column guard
- Created `prevent_owner_billing_column_update()` trigger function
- Blocks shop owners from updating: `plan`, `plan_expires_at`, `plan_billing_cycle`, `pending_plan`, `pending_plan_effective_at`, `subscription_status`
- Super-admins bypass; trigger `prevent_owner_billing_update_trg` on `shops` BEFORE UPDATE

### Step 5 — Bookings over plan limit
- Created `prevent_bookings_over_plan_limit()` per brief SQL
- `auth.role()` check: only `authenticated` role is enforced; `service_role`/seed and `anon` bypass
- Trigger `prevent_bookings_over_plan_limit_trg` on `bookings` BEFORE INSERT

### Step 6 — shop_can_accept_bookings
- Updated to SELECT `subscription_status` column directly (no longer reads from `onboarding` jsonb)
- Still reads `payment_failed_at` from `onboarding` jsonb for 7-day grace period logic
- Trial expiry logic unchanged

### Step 7 — Payment idempotency index
- Partial unique index `payments_provider_payment_id_uniq` on `(provider, provider_payment_id)` WHERE `provider_payment_id IS NOT NULL`

---

## Concerns for Human Review

### 1. Booking limit trigger — jsonb INTO type mismatch (likely apply failure)

The brief SQL uses:

```sql
DECLARE v_access jsonb;
SELECT public.get_shop_feature_access(...) INTO v_access;
```

`get_shop_feature_access` returns `TABLE(allowed boolean, limit_value integer, used integer, upgrade_plan text, current_plan text)`, not `jsonb`. PostgreSQL will reject assigning a multi-column record to a `jsonb` variable.

**Suggested fix before apply:**

```sql
DECLARE
  v_allowed boolean;
BEGIN
  ...
  SELECT g.allowed INTO v_allowed
  FROM public.get_shop_feature_access(NEW.shop_id, 'max_bookings_per_month') AS g;
  IF v_allowed = false THEN ...
```

Alternatively, mirror `prevent_staff_over_plan_limit` inline logic (as the brief prose suggests) to avoid the `has_shop_access` check inside `get_shop_feature_access`.

### 2. Booking limit — anon/public bookings bypass

The `auth.role() IS DISTINCT FROM 'authenticated'` guard means **anonymous public booking inserts skip the limit trigger entirely**. Only dashboard authenticated inserts are checked. Confirm this is intentional; if public `/book` flows must enforce `max_bookings_per_month`, the role check or enforcement path needs revision.

### 3. Backfill vs NOT NULL default

`subscription_status` has `NOT NULL DEFAULT 'active'`. Step 2 WHERE clause targets `NULL` or `''` — existing rows likely have `'active'` default and may not be backfilled from onboarding. Confirm whether a broader backfill is needed for shops whose onboarding jsonb has a different status.

### 4. Duplicate payments before unique index

If duplicate `(provider, provider_payment_id)` rows already exist, Step 7 will fail. Run a dedup query before applying:

```sql
SELECT provider, provider_payment_id, COUNT(*)
FROM public.payments
WHERE provider_payment_id IS NOT NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1;
```

---

## Verification Checklist (for human after apply)

- [ ] `shops.pending_plan` and `shops.pending_plan_effective_at` columns exist
- [ ] `prevent_owner_billing_update_trg` trigger exists on `shops`
- [ ] `prevent_bookings_over_plan_limit_trg` trigger exists on `bookings`
- [ ] `validate_shop_subscription_status` accepts `'none'`
- [ ] `shop_can_accept_bookings(uuid)` reads `subscription_status` column
- [ ] `payments_provider_payment_id_uniq` index exists
- [ ] Owner cannot UPDATE billing columns via Supabase client (expect `billing_columns_owner_update_forbidden`)
- [ ] Super-admin CAN update billing columns

---

## Not Done (per instructions)

- Migration **not applied** (`supabase db reset`, `migration up`, etc.)
- TypeScript types **not regenerated** (Task 8, after human confirms apply)
