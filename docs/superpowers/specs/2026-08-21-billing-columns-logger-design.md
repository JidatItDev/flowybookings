# Platform billing — columns SSOT + checkout logger

**Status:** Draft for review (grilling 2026-08-21)  
**Parent:** [Week 2 billing design](./2026-08-19-week2-billing-design.md)  
**Does not change:** subscribe/upgrade immediate on paid, scheduled downgrade, cancel-until-expiry, Starter floor, paid-through vs next-charge.

---

## Goal

Make shop-level Mollie pointers first-class columns (not `onboarding` JSON), make `plan-sync` a cheap return safety net, and log the checkout/webhook path as structured lines that work in `vite dev` and on Render.

## Out of scope (next pass)

- Charging `plan_pricing` instead of hardcoded `PLAN_PRICE_CENTS` (UI already reads DB; server still uses 19/49/99).
- Appending `MOLLIE_WEBHOOK_SECRET` to the registered webhook URL.
- SMS credit atomic increment.
- Adding a test runner (repo has none).
- Data backfill. Test shops/customers will be deleted; new checkouts write columns only. No JSON fallback.

---

## Product rules (unchanged)

- Webhook is the primary writer when Mollie can reach `/api/mollie/webhook`.
- `POST /api/billing/plan-sync` is the browser return safety net (localhost / delayed webhook). Same lifecycle function. Must not re-apply or re-fetch Mollie when the local payment is already `paid`.
- `payments` holds every charge (`tr_…` on `provider_payment_id`). Shops never store a payment id.
- Owners never write billing columns (DB trigger). Service role (checkout, webhook, sync, crons) may.

---

## Data model

`onboarding` jsonb is shop setup only. Billing code **must not read or write** these keys: `mollie_customer_id`, `mollie_subscription_id`, `payment_failed_at`, `payment_failed_count`, `subscription_cancelled_at`.

### `shops` — shop-level billing

| Column | New? | Type | Meaning |
|---|---|---|---|
| `plan` | no | enum | Entitlements |
| `plan_expires_at` | no | timestamptz | Paid-through; only when Mollie status is **paid** |
| `plan_billing_cycle` | no | text | `monthly` / `yearly` |
| `subscription_status` | no | text | `active` / `cancelled` / `payment_failed` / `none` / … |
| `next_billing_at` | no | timestamptz | When Mollie will **try** the next charge |
| `pending_plan` | no | enum | Scheduled downgrade target |
| `pending_plan_effective_at` | no | timestamptz | When pending applies |
| `mollie_subscription_id` | exists, unused | text | Live `sub_…`. **Start writing it.** |
| `mollie_customer_id` | **yes** | text | Live `cst_…` |
| `payment_failed_at` | **yes** | timestamptz | First recurring failure; 7-day grace |

Do **not** add: `tr_…` on shops, mandate id, `payment_failed_count`, `subscription_cancelled_at`.

Cancel date = `subscription_status = cancelled` + `activity_log`. Access until = `plan_expires_at`.

### `payments` — unchanged

Platform rows: `provider = platform_mollie`, `booking_id` null, `provider_payment_id = tr_…`, metadata `{ plan, cycle, kind, previous_plan, … }`. Snapshot of that charge only.

### Migration (user applies; no backfill)

1. `ALTER TABLE shops ADD COLUMN IF NOT EXISTS mollie_customer_id text;`
2. `ALTER TABLE shops ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;`
3. Partial unique indexes (nulls allowed): `mollie_customer_id`, `mollie_subscription_id`.
4. Extend `prevent_owner_billing_column_update` so owners cannot change: existing billing columns **plus** `mollie_customer_id`, `mollie_subscription_id`, `payment_failed_at`, `next_billing_at`.
5. `shop_can_accept_bookings` reads `shops.payment_failed_at`, not `onboarding->>'payment_failed_at'`.

Agent writes the SQL file. User runs it. Agent does not apply it.

---

## Write path (who sets which column)

| Event | Columns |
|---|---|
| Checkout creates Mollie customer | `mollie_customer_id` |
| First/upgrade **paid** + sub sync | `plan`, `plan_expires_at`, `plan_billing_cycle`, `subscription_status=active`, `next_billing_at`, `mollie_subscription_id`, `pending_*` cleared, `payment_failed_at` null |
| Recurring **paid** | extend `plan_expires_at`, refresh `next_billing_at`, `subscription_status=active`, `payment_failed_at` null |
| Recurring open/pending (SEPA) | `next_billing_at` only; do **not** invent `plan_expires_at` |
| Recurring **failed** | `subscription_status=payment_failed`; set `payment_failed_at` only if it was null |
| Abandoned first / failed upgrade checkout | payment row failed; **shop columns unchanged** |
| Downgrade scheduled | `pending_plan`, `pending_plan_effective_at`; PATCH Mollie; may update `mollie_subscription_id` / `next_billing_at` |
| Cancel | DELETE Mollie sub; `subscription_status=cancelled`; clear pending + `next_billing_at`; **keep** `mollie_customer_id`; clear `mollie_subscription_id` |
| Expiry job → Starter | `plan=starter`, `subscription_status=none`, clear pending/cycle/expires/`next_billing_at`/`mollie_subscription_id`; **keep** `mollie_customer_id` |

Lookups that used `onboarding.contains({ mollie_subscription_id })` use `shops.mollie_subscription_id` instead.

Admin SubscriptionPanel already shows `mollie_subscription_id`; add read-only `mollie_customer_id`.

`getTrialState` / auth shop select: `payment_failed_at` from the column, not JSON.

---

## `plan-sync` vs webhook

**Webhook `received`:** Mollie POST `id=tr_…` → fetch payment from Mollie → apply. Primary in production.

**Return `plan-sync`:** Browser `?billing=success&payment=<local uuid>`. Auth owner/admin. Load local payment.

- If `status === paid` already: return `{ local_status, plan, subscription_status }` **without** calling Mollie. UI toast + clear pending flag.
- Else: call `processMolliePaymentNotification` once (webhook late).

**UpgradePage:** run sync **at most once** per `payment` query param (ref lock). Do not `invalidate`/`refreshShops` in a way that re-fires the effect while `?billing=` is still set. Clear search after the single call.

Processor: if local row is already `paid` and Mollie is paid, return immediately (already true after the payment-status update today — also skip the Mollie GET when local is already paid).

---

## Logger

No `winston` / `pino` package. Tiny module `src/server/logger.ts`, stdout only (Render captures process stdout; no log files).

```ts
createLogger(scope: string) => {
  debug / info / warn / error (msg: string, ctx?: Record<string, unknown>)
  child(extra: Record<string, unknown>) => same
}
```

- **Local default:** `LOG_FORMAT=pretty` (or unset): `[billing.checkout] info payment_row_created shop_id=… payment_id=…`
- **Render / production:** one JSON object per line `{ ts, level, scope, msg, …ctx }` so log search works. Trigger: `NODE_ENV=production` or `LOG_FORMAT=json`.
- **Level:** `LOG_LEVEL=debug|info|warn|error`. Default **debug** locally, **info** when `NODE_ENV=production`. Lines below the active level are not printed.
- **Never log:** `Authorization`, access tokens, API keys, webhook secrets, raw Mollie API key, full request bodies.
- **Do log (checkout phase):** shop_id, payment_id, mollie payment/customer/subscription ids, kind, plan, cycle, mollie_status, local_status, action names (`checkout_created`, `webhook_received`, `return_sync_skipped_already_paid`, `subscription_activated`, `sub_sync_failed`, …).

Replace `console.log` / `console.error` in:

- `plan-checkout.ts`, `plan-sync.ts`, `plan-cancel.ts`, `plan-downgrade.ts`
- `mollie-webhook.ts`, `mollie-subscriptions.ts`
- `billing-expiry.ts`, `billing-reconcile.ts`

Do not migrate the rest of the app in this pass.

---

## Security in this pass

- Owner trigger covers Mollie id columns and `next_billing_at` (currently missing from the trigger).
- `plan-sync` stays authenticated; still does not apply Connect booking payments.
- Logger must not print secrets.

CORS `*` and webhook query-token wiring stay out of this pass.

---

## Verification

User deletes prior test shops / Mollie test customers, applies the migration, then one Starter monthly checkout:

1. After paid: `shops.mollie_customer_id` and `shops.mollie_subscription_id` set; `onboarding` has no new billing keys.
2. Terminal: one `webhook_received` (or `return_sync` if webhook missed) then **at most one** `return_sync`; if webhook already paid, `return_sync_skipped_already_paid` and **no** extra Mollie GET.
3. Admin shop panel shows both Mollie ids.
4. On Render: JSON lines in log stream with `scope` + `shop_id`.

---

## Files (expected)

| Path | Change |
|---|---|
| `supabase/migrations/20260821190000_billing_mollie_columns.sql` | Columns, indexes, trigger, `shop_can_accept_bookings` |
| `src/integrations/supabase/types.ts` | New shop fields |
| `src/server/logger.ts` | Tiny logger |
| `src/shop/billing/server/plan-checkout.ts` | Write `mollie_customer_id`; logger |
| `src/shop/payments/server/mollie-webhook.ts` | Columns not JSON; skip Mollie GET if local paid; logger |
| `src/shop/billing/server/plan-sync.ts` | Short-circuit paid; logger |
| `src/shop/billing/UpgradePage.tsx` | Sync once |
| `plan-cancel`, `plan-downgrade`, `mollie-subscriptions`, `billing-expiry`, `billing-reconcile` | Column reads/writes + logger |
| `src/shared/lib/trial.ts`, `auth-context.tsx`, admin shop select/panel | `payment_failed_at` / customer id |
| `docs/superpowers/plans/2026-08-21-billing-session-context.md` | Point Mollie ids at columns |
