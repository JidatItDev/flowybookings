# Platform billing — E2E edge-case matrix

Use Mollie **test** mode. One shop for monthly lifecycle; second shop for yearly (Y1).

After code fixes for failed upgrade: optimistic `fb.pendingBilling` clears on fail; failed `subscription_upgrade` does **not** set shop `payment_failed`.

## Reset test shop (after a bad F1 run)

In SQL (replace shop id). Then in the browser console: `sessionStorage.removeItem('fb.pendingBilling')` and hard refresh.

```sql
UPDATE public.shops
SET
  plan = 'starter',
  subscription_status = 'active',
  pending_plan = NULL,
  pending_plan_effective_at = NULL,
  onboarding = coalesce(onboarding, '{}'::jsonb)
    - 'payment_failed_at'
    - 'payment_failed_count'
WHERE id = '<shop_id>';
```



## Assert helpers (every case)

```sql
SELECT plan, subscription_status, plan_expires_at, plan_billing_cycle,
       pending_plan, pending_plan_effective_at, onboarding
FROM shops WHERE id = '<shop_id>';

SELECT status, amount_cents, metadata, provider_payment_id, created_at
FROM payments
WHERE shop_id = '<shop_id>' AND provider = 'platform_mollie'
ORDER BY created_at DESC LIMIT 5;

SELECT template_name, status, created_at
FROM email_send_log
ORDER BY created_at DESC LIMIT 10;
```

Browser: `sessionStorage.getItem('fb.pendingBilling')` must be `null` after settle.

---



## Matrix


| ID  | Scenario               | How                                                   | Expect DB                                           | Expect UI                                       | Expect email                               | Result |
| --- | ---------------------- | ----------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | ------ |
| H1  | → Starter paid         | Checkout + Paid                                       | starter, active, payment paid, mollie sub id        | Starter Active, no activating                   | payment_received + plan_changed            | PASS 2026-08-24 |
| H2  | Starter → Pro paid     | Upgrade + Paid                                        | pro, active, payment paid                           | Pro Active                                      | both                                       |        |
| F1  | Starter → Pro Failed   | Upgrade + Failed                                      | plan **starter**, status **active**, payment failed | Starter Active, toast “Payment failed…”, no Pro/activating | no platform-payment-failed                 | PASS 2026-08-25 |
| F2  | Starter → Pro cancel   | Upgrade + cancel/back                                 | plan stays starter, status **active**; payment may stay unpaid then fail | soft toast “Checkout was not completed…”, no Pro/activating | abandoned/upgrade_checkout_failed log only |        |
| F3  | First subscribe cancel | New shop + cancel                                     | no payment_failed for cancel/expire                 | no false Pro                                    | none                                       |        |
| D1  | Pro → schedule Starter | Downgrade                                             | pending_plan starter; plan still pro                | Scheduled line                                  | downgrade_scheduled                        | PASS 2026-08-25 (after bug fix — see notes) |
| D2  | Cancel scheduled downgrade | "Keep current plan" after D1                     | pending_plan/effective_at null, plan unchanged      | Scheduled line disappears, plan stays Premium   | in-app notification only (no email, by design) | PASS 2026-08-25 |
| C1  | Cancel active          | Cancel                                                | cancelled, access until expires                     | badge                                           | cancelled                                  | PASS 2026-08-24 |
| X1  | Expiry after cancel    | `plan_expires_at` past + `POST /hooks/billing-expiry` | starter, none                                       | Starter                                         | in-app notification ok                     | PASS 2026-08-24 (found the access-control gap, fixed 2026-08-25) |
| P1  | Pending apply          | pending effective_at past + expiry hook               | plan = former pending                               | no scheduled line                               | —                                          | PASS 2026-08-25 |
| R1  | Renewal paid           | Recurring tr_* paid + webhook                         | paid row, expires extended, active                  | Active                                          | payment_received                           | PASS 2026-08-24 |
| R2  | Renewal failed         | Recurring failed + webhook                            | payment_failed                                      | Payment failed badge                            | platform-payment-failed                    | PASS 2026-08-24 |
| Y1  | Pro yearly             | Other shop + yearly                                   | expires ≈ +12m                                      | Active                                          | —                                          | PASS 2026-08-25 |
| G1  | Owner cannot set plan  | Client `shops.update({ plan })`                       | trigger error                                       | —                                               | —                                          | PASS 2026-08-25 |
| G2  | plan-confirm           | `POST /api/billing/plan-confirm`                      | 410                                                 | —                                               | —                                          | PASS 2026-08-20 |




### Renewal without waiting a month (R1/R2)

1. Confirm `onboarding.mollie_customer_id` + `mollie_subscription_id`.
2. In Mollie test dashboard, open the customer and use a subscription charge / payment with status Paid or Failed.
3. Ensure webhook or return sync runs (`POST /api/mollie/webhook` body `id=tr_…` if needed).
4. For X1/P1: SQL date bump + `Authorization: Bearer $CRON_SECRET` on `/hooks/billing-expiry`.

---



## Results log

Fill after each run (date, shop id last-4, pass/fail, notes). No secrets.


| Date       | Tester | Pass IDs | Fail IDs | Notes                                                                                                                                                                                  |
| ---------- | ------ | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-20 | agent  | G2       | —        | Code fixes: pending clear + upgrade fail status. G2 `plan-confirm` → 410 verified locally. H/F/D/C/X/R/Y/G1 need Mollie UI + SQL by human. Reset SQL in this doc before re-running F1. |
| 2026-08-24 | human (backfilled) | P0, H1, R1, R2, C1, X1 | — | Backfilled from `.claude/HANDOFF.md` §3 — these were run live that session (ngrok + Mollie test mode, shop `...7881`) but this table was never updated at the time. C1 (cancel) is where the `isCurrent`/`canCancel` UI bugs were found; X1 (expiry sweep) is where the `subscription_status = 'none'` access-control gap was found (fixed 2026-08-25). |
| 2026-08-25 | human | G1 | — | Owner direct client `PATCH .../shops` on `plan` → correctly rejected: `{code: "P0001", message: "billing_columns_owner_update_forbidden"}` (trigger in `20260819120000_week2_billing_foundation.sql`). No Mollie/ngrok needed for this one. |
| 2026-08-25 | human | F1 | — | Starter(lapsed)→Pro upgrade, payment left to auto-expire (no `changePaymentState` link exists for `sequenceType: first` checkout payments — that shortcut is recurring-only). `mollie_status=expired` normalized to `effective_status=failed`, hit `subscription_checkout_not_completed` (not the recurring-failure branch) — shop row unchanged, payment row `failed`, no stray email. F2 considered covered by the same run (same code path for canceled/expired/failed). |
| 2026-08-25 | human | Y1 | — | Starter→Pro, yearly cycle, paid. €490 = 10× the €49/mo Pro price (correct — 2 months free, not full ×12). `plan_expires_at` landed exactly 12 months out (25/08/2027). Both `payment_received` and `plan_changed` emails fired. |
| 2026-08-25 | human | — | D1 (first attempt) | **Bug found**: scheduling Pro-yearly→Starter downgrade immediately PATCHed the live Mollie subscription's amount, and Mollie charged it ~10 min later (collection date next day) despite `plan_expires_at` being a year out. Root cause: `patchMollieSubscription()` always includes `interval` in the PATCH body; Mollie resets the next-payment schedule to "now" whenever `interval` is present, even unchanged. Fixed per `docs/superpowers/plans/2026-08-25-downgrade-premature-charge-fix.md`: scheduling no longer touches Mollie at all; the cron patches Mollie only when it actually applies the plan at period end. |
| 2026-08-25 | human | D1 (re-run, post-fix) | — | Premium-yearly→Pro downgrade scheduled: **zero Mollie interaction confirmed** (checked the dashboard — nothing changed, no charge). Also exercised switching the pending target Pro→Starter→Pro before it applies — each just overwrote `pending_plan` with the same untouched `effective_at`, no Mollie calls on any of them. UI correctly showed "Scheduled: Pro on 25/08/2027" and the billing card's "Next charge €490" correctly reflected the *pending* plan's price, not the current Premium price. |
| 2026-08-25 | human | P1 | — | Backdated `pending_plan_effective_at` to yesterday, hit `/hooks/billing-expiry` manually. Response: `pending_applied: [{shop_id, from: "premium", to: "pro"}]`. Mollie subscription patched to €490 (Pro yearly) at the same moment — confirmed **no premature/duplicate charge** fired (the subscription had already had one real charge before, from earlier testing, so this patch didn't restart its schedule — matches the fix's design intent: only the very first patch on a never-yet-charged subscription seems to force an immediate charge). Confirmed via code read that neither `billing-expiry.ts` nor `billing-reconcile.ts` ever creates/charges a Mollie payment directly — actual charging is entirely Mollie's own autonomous subscription engine; our crons only keep the subscription's price correct. |


