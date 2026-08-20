# Week 2 — Owner Revenue & Payment Foundation (Design Spec)

**Status:** Approved (grilling session 2026-08-19)  
**Milestone:** FlowyBookings 4-Week Plan — Week 2

---

## Goal

Empower shop owners to connect their Mollie payout accounts, subscribe to platform recurring plans (Starter / Pro / Premium), and ensure premium features cannot be unlocked without payment. All milestone work items must be functional and demonstrated in one extended acceptance test.

---

## Strategy

**Repair the current stack** — do not rebuild billing. Two independent Mollie integrations remain:

| Track | Purpose | Account |
|---|---|---|
| **Mollie Connect** | Shop owner payout / deposit account linking | Shop OAuth tokens in `shop_payment_providers` |
| **Platform Mollie** | FlowyBookings SaaS subscriptions | FlowyBookings `MOLLIE_API_KEY` |

---

## Security & Authority

### Plan write protection

- Shop owners **never** write: `plan`, `plan_expires_at`, `plan_billing_cycle`, `pending_plan`, `pending_plan_effective_at`, `subscription_status`.
- **DB trigger** rejects owner updates to protected billing columns (blocks direct Supabase client bypass).
- Remove owner-facing `changeShopPlan` from browser flows.
- Remove owner-accessible `POST /api/billing/plan-confirm`.
- Mock/manual billing: **super-admin + test mode only**.

### Super-admin overrides

- Manual plan changes: super-admin only, via server path.
- Audit: `activity_log` with `entity = platform_billing`, `action = admin_plan_override`.
- Metadata: `{ shop_id, old_plan, new_plan, old_expires, new_expires, reason, actor_id }`.
- **Reason required** in admin UI before save.

---

## Data Model

### `shops` columns

| Column | Purpose |
|---|---|
| `plan` | Current active plan tier |
| `plan_expires_at` | Current paid/trial period end |
| `plan_billing_cycle` | `monthly` \| `yearly` |
| `subscription_status` | **SSOT:** `active` \| `cancelled` \| `payment_failed` \| `none` |
| `pending_plan` | Scheduled downgrade/change target |
| `pending_plan_effective_at` | When pending change takes effect |
| `onboarding` (jsonb) | Mollie **customer_id** and **subscription_id** only — no status |

### Unpaid floor

- Post-cancel or post-paid-expiry → **`starter`** (never `trial`).
- New shops: existing **14-day trial** unchanged; trial expiry → Starter via existing logic.

### Entitlements

- **`plan_features` table is authoritative** (admin-editable via `PlanConfigurationCard`).
- Runtime reads DB / `get_shop_feature_access` RPC — not hardcoded `FEATURES` map in `plans.ts`.

---

## Subscription Lifecycle

| Action | Behavior |
|---|---|
| **Subscribe** | Mollie first payment → webhook activates plan, creates recurring sub, `subscription_status = active` |
| **Upgrade** | New checkout payment → plan updates **immediately**; PATCH/create Mollie sub; clears pending fields; payment received email |
| **Downgrade** | Schedule: set `pending_plan` + `pending_plan_effective_at`; **PATCH Mollie sub at schedule time**; local plan stays until effective date |
| **Cancel** | DELETE Mollie sub; `subscription_status = cancelled`; access until `plan_expires_at`; clears pending |
| **Renewal** | Recurring webhook → upsert `payments` → extend `plan_expires_at` |
| **Expiry** | Single job: cancelled or expired paid → `plan = starter`, clear pending/status |

### Future intent rule

Only one future intent at a time. Upgrade = immediate + clears pending. Cancel = wins + clears pending.

### Billing cycles

Both **monthly** and **yearly** live. Yearly price = 10× monthly (2 months free).

---

## Webhooks & Cron

### Platform webhook (primary renewal path)

1. Fetch payment from Mollie API.
2. Match by **metadata** (`shop_id` + `kind: subscription_recurring`) first.
3. Fallback: lookup shop by `onboarding.mollie_subscription_id`.
4. Upsert `payments` row, extend `plan_expires_at`, sync `subscription_status`.

### Single expiry job

Replace `expire-sweep` + `expire-cancelled-subscriptions` divergence. Route: `/hooks/billing-expiry`. Lands all lapsed paid/cancelled shops on **Starter**.

### Reconciliation cron

Recovery only — replays missed renewals/webhooks. Not primary renewal mechanism.

### Connect token refresh

Fix hardcoded preview URL → `APP_URL` + `CRON_SECRET`. Required for Connect to be considered functional.

---

## Server-Enforced Limits

| Limit | Mechanism |
|---|---|
| Staff count | Existing INSERT trigger on `staff` |
| Booking count | New INSERT trigger on `bookings` (same logic as `get_shop_feature_access`) |
| Trial bookings | Lifetime cap (30) — demo on trial shop |
| Feature entitlements | Server-side on write paths; demo `advanced_analytics` |

Migrate `shop_can_accept_bookings` to read `shops.subscription_status` column (not onboarding jsonb).

---

## Billing UI

- **Canonical page:** `/shop/billing` (alias of upgrade page).
- **Checkout return:** `/shop/billing?billing=success`.
- **Display:** current plan, cycle, renewal/expiry date, status badge (Active / Cancelled — access until {date} / Payment failed), scheduled change when `pending_plan` set, last 5 platform payments.

---

## Emails

Via `sendEmail()` + `email_templates` (Resend queue). Seed types:

| `type` | Trigger |
|---|---|
| `subscription_payment_received` | First payment, renewal, upgrade checkout success |
| `subscription_plan_changed` | Plan activated or upgraded |
| `subscription_cancelled` | Cancel confirmed |
| `subscription_downgrade_scheduled` | Downgrade scheduled |
| `platform-payment-failed` | Wire existing slug into webhook flow |

Display names may be Dutch in admin UI.

---

## Mollie Connect (Week 2 scope)

OAuth connection, stored tokens, org/profile visibility, disconnect. **No customer deposit payment** (Week 3).

---

## Acceptance Test

### Shop A — full monthly lifecycle

1. Connect Mollie
2. Subscribe Starter monthly
3. Upgrade to Pro
4. Schedule downgrade to Starter (pending visible, plan still Pro)
5. Cancel (access until expiry)
6. Expiry → Starter
7. API bypass blocked
8. Staff limit blocked
9. Trial shop booking cap (30) blocked
10. `advanced_analytics` blocked on Starter, allowed on Pro

### Shop B — yearly smoke

1. Connect Mollie
2. Subscribe Pro yearly
3. Verify ~12-month expiry

### Connect cron

Trigger refresh hook → connection still healthy.

---

## Out of Scope (Week 2)

- Customer deposit payments via Connect (Week 3)
- Stripe integration
- Proration / mid-cycle credits
- Signup flow changes
- Full RLS enforcement of every feature flag (one feature proof sufficient)

---

## Known Bugs to Fix

- `plan-checkout` drops `onboarding` on select → customer reuse broken / jsonb wipe
- Billing redirect lands on `/shop/settings` but UI listens on `/shop/billing`
- Downgrade applies plan immediately despite "scheduled" toast
- `FEATURES` map vs `plan_features` mismatch
- Duplicate `subscription_status` (column vs onboarding)
- Recurring renewals ignored by webhook
