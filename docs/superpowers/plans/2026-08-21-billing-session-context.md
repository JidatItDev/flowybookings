# Week 2 billing — session context & achievements

**Last updated:** 2026-08-21  
**Repo:** `apppoint-craft` (FlowyBookings)  
**Scope:** Platform Mollie SaaS subscriptions (not Mollie Connect shop payouts)  
**Primary test shop:** `4b84f9ab-fa58-4cfc-9184-7b1ec2f184aa`  
**Mollie customer (test):** `cst_A7g9QTthYm`

Use this as the handoff for a new chat/agent. Spec/plans remain authoritative for product rules; this doc is what we actually built and learned.

---

## Product model (locked)

| Track | Purpose |
|---|---|
| **Mollie Connect** | Shop payout accounts (`shop_payment_providers`) |
| **Platform Mollie** | FlowyBookings SaaS plans via `MOLLIE_API_KEY_*` |

**Plans:** trial → floor **Starter** (never back to trial after paid). Paid: Starter / Pro / Premium. Cycles: monthly + yearly (yearly = 10× monthly).

**SSOT columns on `shops`:**

| Column | Meaning |
|---|---|
| `plan` | Current entitlements tier |
| `plan_expires_at` | **Paid-through** date — only set/extended when Mollie status is **paid** |
| `next_billing_at` | When Mollie will **try** the next charge (SEPA collection / `nextPaymentDate`) |
| `plan_billing_cycle` | `monthly` \| `yearly` |
| `subscription_status` | `active` \| `cancelled` \| `payment_failed` \| `none` |
| `pending_plan` + `pending_plan_effective_at` | Scheduled downgrade (local plan stays until effective) |
| `onboarding.mollie_customer_id` / `mollie_subscription_id` | Mollie ids only — not status |

**Lifecycle rules:**

- Subscribe / upgrade → checkout → webhook activates plan **immediately** on paid.
- Downgrade → schedule locally; **PATCH Mollie now** to lower amount for next charge.
- Cancel → DELETE Mollie sub; access until `plan_expires_at`; then expiry job → Starter.
- Renewal → recurring webhook paid → extend `plan_expires_at` + refresh `next_billing_at`.
- Failed/canceled **upgrade** checkout must **not** set shop `payment_failed` (only recurring failures may).
- Owners never write billing columns (DB trigger). Mock checkout removed (503 if keys missing; `plan-confirm` → 410).

**Keep on app (not Edge):** checkout, cancel, downgrade, Mollie webhook, billing-expiry/reconcile hooks. Email drain = Supabase Edge `process-email-queue`. Billing crons should call vault `app_url` (migration `20260820130000_billing_crons_app_url.sql`).

---

## What we achieved

### Foundation

- Removed mock billing; real Mollie platform checkout with `MOLLIE_MODE` + test/live keys.
- Webhook URL helper: public HTTPS `APP_URL` (ngrok locally) or omit `webhookUrl`.
- Return path: `POST /api/billing/plan-sync` so local/dev can settle without relying only on webhooks.
- `CRON_SECRET` via `serverEnv()` (hooks were 401 when only reading `process.env`).
- Subscription emails (owner email fallback); Edge email queue path documented.
- Migrations: pending plan columns, owner billing guard, booking limit, status SSOT, payment idempotency, cron `app_url` cutover.
- Docs: design spec, foundation plan, acceptance checklist, E2E matrix, host cron cutover.

### Happy path verified

- Starter subscribe (paid) → Active.
- Upgrade to Pro → immediate plan + payment emails.
- Schedule downgrade to Starter → pending UI; Mollie amount intended to drop.

### Edge-case fixes (F1/F2)

- Clear `fb.pendingBilling` on failed/unpaid return — no sticky “Pro activating”.
- Failed/canceled/expired `subscription_upgrade` does **not** flip shop to `payment_failed`.
- Soft toast for open/cancel checkout; hard fail only for Mollie `failed`.

### Expiry / renew display (learned the hard way)

**Bug:** Manual `/hooks/billing-expiry` applied pending Pro→Starter, then same run treated past `plan_expires_at` as expire → cleared expiry / status toward `none` → UI “Starter Active” + “No active subscription yet”.

**Bug:** Repair SQL inventing `plan_expires_at = now()+1 month` while Mollie SEPA was still **Awaiting** (collection later) — UI said “renews 21/9” while Mollie collected 24/8.

**Correct model now:**

- `plan_expires_at` = paid-through only.
- `next_billing_at` = Mollie next attempt.
- Billing card: **Next charge** / **Payment pending** from `next_billing_at` or unpaid recurring payment; **Access until** from `plan_expires_at` when cancelled.
- Expiry: apply pending **without inventing** a new paid-through; **skip** expire while live `mollie_subscription_id` or future `next_billing_at`.
- Webhook: ingest open/pending recurring (SEPA awaiting) → set `next_billing_at`; only **paid** extends `plan_expires_at`.

### Duplicate Mollie subscriptions (latest)

**Symptom (shop above):** two active Mollie subs (STARTER €19 + PRO €49), awaiting charges on both; downgrade PATCH 422:

`A subscription with the same description already exists for this customer`

**Cause:** local `mollie_subscription_id` cleared earlier while Mollie STARTER sub stayed alive; Pro upgrade **created** a second sub; downgrade tried to rename description to STARTER and hit uniqueness.

**Fix landed:**

- `src/shop/billing/server/mollie-subscriptions.ts` — `ensureSinglePlatformSubscription`:
  - stable description per shop (no plan name in description),
  - cancel orphan active/pending subs,
  - PATCH preferred/reuse one, else create.
- Wired into paid webhook (first/upgrade) and `plan-downgrade`.
- Downgrade **fails** if Mollie sync fails (no local-only schedule lying about €19 while Mollie still charges €49).

**Manual cleanup still needed for that test customer:** cancel the orphan STARTER (or both) in Mollie dashboard, then re-run schedule Starter / one upgrade so sync collapses to a single sub.

---

## Key files

| Area | Path |
|---|---|
| Checkout | `src/shop/billing/server/plan-checkout.ts` |
| Sync on return | `src/shop/billing/server/plan-sync.ts` |
| Downgrade | `src/shop/billing/server/plan-downgrade.ts` |
| Cancel | `src/shop/billing/server/plan-cancel.ts` |
| Mollie sub sync | `src/shop/billing/server/mollie-subscriptions.ts` |
| Expiry cron | `src/shop/billing/server/billing-expiry.ts` → `/hooks/billing-expiry` |
| Reconcile | `src/shop/billing/server/billing-reconcile.ts` |
| Webhook | `src/shop/payments/server/mollie-webhook.ts` |
| UI | `src/shop/billing/ShopBillingCard.tsx`, `UpgradePage.tsx`, `use-pending-billing.ts` |
| Auth shop fields | `src/auth/lib/auth-context.tsx` (`next_billing_at` selected) |
| Platform keys | `src/shared/lib/mollie-platform.ts` |
| Design | `docs/superpowers/specs/2026-08-19-week2-billing-design.md` |
| E2E matrix | `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md` |
| Acceptance | `docs/superpowers/plans/2026-08-19-week2-billing-acceptance.md` |

---

## Env / local testing

- `MOLLIE_MODE=test`, `MOLLIE_API_KEY_TEST`, public `APP_URL` (ngrok) for webhooks.
- `CRON_SECRET` for `/hooks/billing-expiry` and related.
- User applies Supabase migrations themselves; do **not** commit unless asked.
- Keep ngrok up when expecting Mollie → local webhook.

---

## Testing status (honest)

| Case | Status |
|---|---|
| Starter subscribe paid | Done |
| Upgrade Pro paid | Done (re-tested 2026-08-21) |
| Failed upgrade UX (F1/F2) | Code fixed; human Mollie UI verify |
| Schedule downgrade UI | Works locally; **Mollie sync was broken** until orphan-sub fix — retest after Mollie cleanup |
| SEPA awaiting → next charge date | Model + UI fixed; re-fire webhook / set `next_billing_at` as needed |
| Cancel + expiry → Starter | Partially exercised via manual expiry; retest clean path |
| Yearly shop | Documented; may not be fully run |
| Connect token refresh | Documented in acceptance |
| Duplicate Mollie subs | Fixed in code; **cleanup customer `cst_A7g9QTthYm` manually** |

---

## Current shop reality (as of last user report)

UI roughly:

- Plan: **Pro · Monthly · Active**
- Scheduled: **Starter** on ~21/09/2026
- Next charge shown as **€19** on that date (local pending) — **misleading** if Mollie still has PRO €49 + orphan STARTER €19 awaiting

Mollie had **two** active subscriptions + awaiting charges. After code deploy: cancel orphans in Mollie, clear bad pending if needed, re-schedule Starter so `ensureSinglePlatformSubscription` leaves one sub at €19 and updates `next_billing_at`.

Optional SQL:

```sql
SELECT plan, subscription_status, plan_expires_at, next_billing_at,
       pending_plan, pending_plan_effective_at,
       onboarding->>'mollie_customer_id' AS customer,
       onboarding->>'mollie_subscription_id' AS subscription
FROM shops WHERE id = '4b84f9ab-fa58-4cfc-9184-7b1ec2f184aa';
```

---

## Open / next

1. **Mollie cleanup** for test customer → one active subscription; retest D1 (schedule Starter).
2. Re-verify SEPA awaiting path: unpaid recurring → `next_billing_at` + “Payment pending”; paid → extend `plan_expires_at`.
3. Finish remaining E2E matrix rows (cancel, expiry, yearly, Connect cron).
4. Optional: super-admin Mollie↔shops debug page (discussed, not built).
5. Production: Render/Node adapter + vault `app_url` cutover (see host-cron doc).
6. Do not invent paid-through dates in SQL “repairs”; set `next_billing_at` to Mollie’s collection date instead.

---

## Agent constraints (from this project)

- User applies DB migrations.
- No git commit/push unless explicitly asked.
- Prefer surgical changes; match existing patterns.
- Platform billing ≠ Connect payouts — keep separate.
