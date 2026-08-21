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
| H1  | → Starter paid         | Checkout + Paid                                       | starter, active, payment paid, mollie sub id        | Starter Active, no activating                   | payment_received + plan_changed            |        |
| H2  | Starter → Pro paid     | Upgrade + Paid                                        | pro, active, payment paid                           | Pro Active                                      | both                                       |        |
| F1  | Starter → Pro Failed   | Upgrade + Failed                                      | plan **starter**, status **active**, payment failed | Starter Active, toast “Payment failed…”, no Pro/activating | no platform-payment-failed                 |        |
| F2  | Starter → Pro cancel   | Upgrade + cancel/back                                 | plan stays starter, status **active**; payment may stay unpaid then fail | soft toast “Checkout was not completed…”, no Pro/activating | abandoned/upgrade_checkout_failed log only |        |
| F3  | First subscribe cancel | New shop + cancel                                     | no payment_failed for cancel/expire                 | no false Pro                                    | none                                       |        |
| D1  | Pro → schedule Starter | Downgrade                                             | pending_plan starter; plan still pro                | Scheduled line                                  | downgrade_scheduled                        |        |
| D2  | Cancel clears pending  | Cancel after D1                                       | pending null, cancelled                             | Cancelled until date                            | subscription_cancelled                     |        |
| C1  | Cancel active          | Cancel                                                | cancelled, access until expires                     | badge                                           | cancelled                                  |        |
| X1  | Expiry after cancel    | `plan_expires_at` past + `POST /hooks/billing-expiry` | starter, none                                       | Starter                                         | in-app notification ok                     |        |
| P1  | Pending apply          | pending effective_at past + expiry hook               | plan = former pending                               | no scheduled line                               | —                                          |        |
| R1  | Renewal paid           | Recurring tr_* paid + webhook                         | paid row, expires extended, active                  | Active                                          | payment_received                           |        |
| R2  | Renewal failed         | Recurring failed + webhook                            | payment_failed                                      | Payment failed badge                            | platform-payment-failed                    |        |
| Y1  | Pro yearly             | Other shop + yearly                                   | expires ≈ +12m                                      | Active                                          | —                                          |        |
| G1  | Owner cannot set plan  | Client `shops.update({ plan })`                       | trigger error                                       | —                                               | —                                          |        |
| G2  | plan-confirm           | `POST /api/billing/plan-confirm`                      | 410                                                 | —                                               | —                                          |        |




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


