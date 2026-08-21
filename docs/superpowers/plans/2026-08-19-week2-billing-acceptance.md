# Week 2 billing — acceptance checklist

Run after email-template, Edge email-queue, and **billing `app_url` cron** migrations are applied.
See also:
- `docs/superpowers/plans/2026-08-20-billing-host-cron-cutover.md`
- `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md` (full edge-case matrix F1/F2/R1/…)

## Shop A — monthly lifecycle

1. Connect Mollie on `/shop/payments` (org/profile visible; disconnect works).
2. Subscribe **Starter monthly** from `/shop/billing` → return `?billing=success` → status **Active**.
3. Upgrade to **Pro** → plan immediate, payment row, emails `subscription_payment_received` + `subscription_plan_changed`.
4. Schedule downgrade to Starter → pending line; plan stays Pro.
5. Cancel → badge “Cancelled — access until {date}”; pending cleared.
6. Trigger `/hooks/billing-expiry` (or wait) → **Starter**, not trial.
7. As owner: `supabase.from('shops').update({ plan: 'premium' })` → `billing_columns_owner_update_forbidden`.
8. `POST /api/billing/plan-confirm` → 410 Gone (mock billing removed).
9. Add staff past plan max → `STAFF_PLAN_LIMIT`.
10. Analytics on Starter → locked; on Pro → allowed.

## Failed upgrade (F1/F2) — must pass after edge-case fixes

- Starter → Pro + Mollie **Failed** or cancel: shop stays **Starter / active**; payment row failed; UI must **not** show Pro + activating; `sessionStorage.fb.pendingBilling` cleared.

## Trial shop — booking cap

Create/use a trial shop and insert 31st booking → `bookings_over_plan_limit`.

## Shop B — yearly

Connect Mollie → subscribe **Pro yearly** → `plan_expires_at` ≈ +12 months.

## Connect cron

`POST /hooks/mollie-refresh-tokens` with `Authorization: Bearer $CRON_SECRET` → still connected.

## Host / cron cutover

- Vault `app_url` matches production `APP_URL`.
- `cron.job` for billing-expiry / reconcile / mollie-refresh uses that host (migration `20260820130000`).
- Admin expire sweep requires super-admin; toast reports `expired` + `pending` counts.
