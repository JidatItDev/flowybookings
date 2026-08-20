# Week 2 billing — acceptance checklist

Run after the email-template and cron migrations are applied.

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

## Trial shop — booking cap

Create/use a trial shop and insert 31st booking → `bookings_over_plan_limit`.

## Shop B — yearly

Connect Mollie → subscribe **Pro yearly** → `plan_expires_at` ≈ +12 months.

## Connect cron

`POST /hooks/mollie-refresh-tokens` with `Authorization: Bearer $CRON_SECRET` → still connected.
