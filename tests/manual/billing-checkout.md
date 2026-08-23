# Manual test plan: shop → platform billing

Scenarios that need a real Mollie test-mode round trip and can't be covered by
unit/integration tests against fakes. Requires `MOLLIE_MODE=test` and a real
`MOLLIE_API_KEY_TEST` in the environment you're testing against.

Check off the date + result each time this is run, don't just tick the box once and forget it.

## Cancel subscription (`plan-cancel.ts`)

| # | Scenario | Steps | Expected | Last run |
|---|---|---|---|---|
| 1 | Normal cancel | Create a paid-plan shop with a live test-mode Mollie subscription. Click Cancel in `ShopBillingCard`. | 200 response. `shops.subscription_status = cancelled`, `mollie_subscription_id = null`. Cancellation email sent. Mollie dashboard shows the subscription cancelled. | — |
| 2 | Already-gone on Mollie (404) | Same as #1, but cancel the subscription directly in the Mollie test dashboard first, *then* click Cancel in the app. | 200 response, treated as success (not an error) — `resolveCancelOutcome`'s "no Mollie call needed" path doesn't apply here since `subId` is still set locally, so this exercises the 404-as-success branch in `cancelMollieSubscription`. Shop still ends up `cancelled` locally. | — |
| 3 | Real Mollie failure | Temporarily set an invalid `MOLLIE_API_KEY_TEST` (or point `mollie_customer_id` at a customer that doesn't exist), then click Cancel. | 502 response with `error: "mollie_cancel_failed"`. Shop `subscription_status` **unchanged** (still whatever it was before — not `cancelled`). `mollie_subscription_id` **unchanged** (not nulled). `activity_log` has a `subscription_cancel_failed` row. No cancellation email sent. | — |
| 4 | Double-click / already cancelled | Run scenario #1, then click Cancel again (or POST to `/api/billing/plan-cancel` again with the same shop id). | 200 response `{ ok: true, already_cancelled: true }`. No second email, no second `activity_log` entry, no Mollie call made. | — |
| 5 | Retry after failure | Immediately after scenario #3, fix the bad key/customer id and click Cancel again. | Succeeds as scenario #1 — confirms the failed attempt didn't corrupt local state and a retry is safe. | — |

## Other checkout flows

Not yet written up — add a section here (checkout → activation, upgrade mid-cycle, downgrade at period end, recurring charge failure + grace period, expiry cron, reconcile cron) as each one gets its end-to-end pass during the broader billing hardening effort.
