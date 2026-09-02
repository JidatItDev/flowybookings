# Week 3 Booking Hardening — Manual E2E Test Cases

Walk through these on the real platform after applying migrations and setting `MOLLIE_CONNECT_WEBHOOK_SECRET`. Use Mollie's test mode (test API keys / test cards) so nothing is a real charge.

## Prerequisites

- [ ] Migrations applied in order: `20260902120000_week3_deposit_mode.sql` **first**, then the code deployed, then the remaining 5.
- [ ] `MOLLIE_CONNECT_WEBHOOK_SECRET` set in the deployment environment (separate from `MOLLIE_WEBHOOK_SECRET`).
- [ ] Two test shops:
  - **Shop A** — Mollie Connect connected (test mode).
  - **Shop B** — Mollie Connect **not** connected.
- [ ] On Shop A, two services:
  - **Service 1** — deposit mode "custom", a fixed deposit amount (e.g. €10 on a €50 service).
  - **Service 2** — deposit mode "default" (uses shop's default deposit %).
  - **Service 3** — no deposit at all (0% / €0).
- [ ] Shop A's Settings → Booking Rules has a default deposit % set to something nonzero (e.g. 20%).
- [ ] A staff member assigned to all three services, with normal working hours set.
- [ ] Access to: Supabase table editor (or SQL) for `bookings`, `payments`, `activity_log`, `email_send_log`; and wherever outbound emails land in test mode (Resend test inbox, or the `email_send_log` row's rendered content).

---

## A. Deposit configuration

**A1 — Custom deposit amount is what's actually charged**

1. Go to Shop A → Services → Service 1, confirm it's set to "custom amount" with your configured €10.
2. Book Service 1 through the public booking page as a customer.
3. On the Mollie checkout page, confirm the amount shown is exactly €10.00 — not the full service price, not the shop's default %.

**A2 — Default-percent deposit is computed correctly**

1. Confirm Shop A's default deposit % (e.g. 20%) and Service 2's price (e.g. €50).
2. Book Service 2 publicly.
3. On the Mollie checkout page, confirm the charged amount is price × percent (e.g. €10.00 for €50 @ 20%), not €0 and not the full price.

**A3 — No-deposit service skips payment entirel y**

1. Book Service 3 (no deposit) publicly.
2. Confirm you are **not** redirected to Mollie at all — the booking should confirm immediately and take you straight to the confirmation page showing "confirmed".

**A4 — Changing the default % updates future default-mode bookings, not past ones**

1. Book Service 2 once (note the charged deposit).
2. Change Shop A's default deposit % to a different value.
3. Book Service 2 again — confirm the NEW booking charges the new percentage.
4. Check the DB `bookings` row for the FIRST booking — its `deposit_cents` should still reflect the percentage that was in effect when it was created (frozen at booking time), not retroactively changed.

---

## B. No-Mollie-connected blocking

**B1 — Deposit-required service is blocked on a shop with no Mollie connection**

1. On Shop B (no Mollie), open the public booking page.
2. Find a service that requires a deposit (custom amount > 0, or default-mode with a nonzero shop percentage).
3. Confirm that service appears visibly disabled/grayed out in the picker with an "unavailable" note, and cannot be selected.

**B2 — No-deposit services stay bookable on a shop with no Mollie connection**

1. On Shop B, confirm a service with no deposit configured (0%, or custom €0) is still fully bookable and completes normally without any payment step.

**B3 — Server-side block actually fires (not just a UI hint)**

1. On Shop B, try to force a booking for a deposit-required service by directly submitting the booking form via devtools/API (bypassing the grayed-out UI) if you're comfortable doing so, OR just confirm via the DB: after test B1, check that no `bookings` row exists in a `confirmed` state with a deposit for Shop B.
2. If you can trigger the direct API call: confirm the response is `409` with `mollie_not_connected`, and the resulting `bookings` row status is `cancelled`, not `confirmed`.
3. Check `activity_log` for an entry with `entity: "booking"`, `action: "blocked_no_mollie_connection"`.

**B4 — Reconnecting Mollie immediately unblocks the service**

1. Connect Mollie to Shop B (test mode).
2. Refresh the public booking page — confirm the previously-blocked service is now selectable and bookable.

---

## C. Real deposit payment → confirmation (the core fix)

**C1 — Successful payment confirms the booking AND sends the confirmation email**

1. Book Service 1 on Shop A, complete payment on Mollie's test checkout with a "paid" test card/method.
2. After redirect back, confirm the confirmation page shows the booking as confirmed (not stuck on a spinner).
3. Check the `bookings` row: `status = confirmed`.
4. Check the `payments` row: `status = paid`, `provider_payment_id` set.
5. **Check `email_send_log`** for a `booking-confirmation` row to the customer's email, and confirm its rendered content shows the correct appointment time in the SHOP's timezone (not a shifted time).
6. Check `activity_log` for `entity: "payment"`, `action: "confirmed"`.

**C2 — Confirmation page reflects "confirming" state briefly, then resolves**

1. Book and pay for Service 1 again.
2. Immediately after the Mollie redirect lands you back on the confirmation page, watch closely — you may briefly see a "confirming your payment…" state before it flips to the confirmed view once the webhook lands. This is expected and correct (this was previously always instantly "You're booked!" regardless of actual status).

**C3 — A retried webhook delivery does not double-send the confirmation email**

1. This is hard to trigger manually (Mollie retries are automatic and infrequent), but if you have access to Mollie's webhook logs/replay tool for this payment, manually replay the webhook delivery for an already-paid payment.
2. Confirm only ONE `booking-confirmation` email exists in `email_send_log` for that booking, not two.

---

## D. Payment failure handling

**D1 — A failed payment cancels the booking and releases the slot**

1. Book Service 1, but on Mollie's test checkout, choose a "failed" test payment method/outcome.
2. Confirm the `bookings` row flips to `status = cancelled`.
3. Confirm the `payments` row flips to `status = failed`.
4. Confirm the confirmation page shows a failure state with a "try again" option, not a success message.
5. Check `email_send_log` for a `booking-payment-failed` email, with the correct shop-local appointment time.
6. Immediately try booking the SAME slot again as a different (or the same) customer — confirm it's available again (the slot was released).

**D2 — The "try again" link on the failure page works**

1. From D1's failure page, click "try again" / retry.
2. Confirm it takes you back to the booking flow for the same shop (fresh booking attempt), not a broken link.

---

## E. Duplicate payment prevention (idempotency)

**E1 — Double-clicking "pay deposit" doesn't create two Mollie payments**

1. Start booking Service 1. On the payment step, if there's a "pay deposit" button, click it twice in rapid succession (or open devtools and fire the checkout request twice quickly).
2. Check the `payments` table for that `booking_id` — confirm only ONE row exists with `status = unpaid` (or that a second attempt returned the same checkout URL as the first, not a new payment).
3. On your Mollie test dashboard, confirm only one payment was actually created for this booking.

---

## F. Double-booking prevention

**F1 — Two customers can't book the exact same slot for the exact same staff member**

1. Open the public booking page in two separate browser sessions (or one normal + one incognito).
2. In both, select the same service, same staff member, same date/time slot.
3. Submit both bookings as close together in time as you can manage.
4. Confirm exactly ONE succeeds; the other gets a "this slot was just taken" error and is bounced back to re-pick a time — not a silent double-booking.
5. Check the `bookings` table: only one non-cancelled booking exists for that staff/time combination.

**F2 — Normal sequential booking still works**

1. Book a slot for a staff member.
2. Confirm that same staff member's OTHER time slots (before/after) are still bookable normally — the fix shouldn't over-block adjacent times.

---

## G. Abandoned booking TTL sweep

**G1 — A booking abandoned mid-checkout gets released after ~30 minutes**

1. Book Service 1, get redirected to Mollie's checkout page, then just close the tab/abandon it without paying or cancelling.
2. Confirm the `bookings` row exists with `status = pending`.
3. Wait ~30–40 minutes (the sweep runs every 10 minutes, TTL is 30 minutes), or if you have cron access, manually trigger the `/hooks/booking-expiry` endpoint.
4. Confirm the booking flips to `status = cancelled`, its `payments` row flips to `status = failed`, and the slot is bookable again by someone else.
5. Check `email_send_log` for a `booking-payment-failed` notification to that customer.
6. Check `activity_log` for `entity: "booking"`, `action: "expired_pending_sweep"`.

**G2 — A shop owner's manually-created "pending" booking is NOT touched by the sweep**

1. As the shop owner, go to the calendar and manually create a booking, leaving its status as "pending" (the default), for a time more than 30 minutes in the past relative to when you'll check.
2. Wait for a sweep cycle (or trigger it manually).
3. Confirm this manually-created booking is **untouched** — still `pending`, no cancellation, no email sent to the customer. (This was a real bug the final review caught — worth specifically confirming it's fixed.)

---

## H. Confirmation page behavior

**H1 — Cancelled/failed booking shows the right state, not a stale success**

1. Navigate directly to the confirmation page URL for a booking you know failed or was cancelled (from D1 or G1).
2. Confirm it shows the failure/cancelled view with a retry option — not "You're booked!"

**H2 — A never-existed or garbage booking ID shows a proper not-found state**

1. Navigate to the confirmation page with a random/invalid booking ID in the URL.
2. Confirm you get a clean "not found" page, not a crash or blank screen.

---

## I. Timezone correctness

**I1 — Booking times display correctly for a shop in a non-UTC timezone**

1. If Shop A's timezone is set to something other than UTC (e.g. `Europe/Amsterdam`), book a slot and confirm the time shown throughout the flow (picker, sidebar, review, confirmation page) matches the shop's local time, not a shifted UTC time.

**I2 — Confirmation and failure emails show shop-local time, not server time**

1. From C1 and D1, check the actual rendered email content's appointment time — confirm it matches what the customer selected in shop-local time (this was a real bug: emails used to show server time, which could be hours off).

**I3 — The 90-day booking window respects the shop's date, not your browser's date**

1. If you can change your own device/browser timezone to something far from the shop's (e.g. test from a timezone many hours ahead or behind), check that the last bookable day in the calendar picker is still exactly 90 days out **in the shop's timezone**, not shifted by a day due to your local browser clock.

---

## J. Balance display (shop owner view)

**J1 — Remaining balance shows correctly on a deposit-paid booking**

1. As the shop owner, open the calendar and view a confirmed booking that had a deposit paid (from C1).
2. Confirm you see a "remaining balance owed" line showing price minus deposit — not the full price, not blank.

**J2 — No balance line on a fully-covered or no-deposit booking**

1. View a booking for a no-deposit service (from A3).
2. Confirm no remaining-balance line appears (or it correctly shows €0), since nothing is owed beyond what was already handled.

**J3 — Balance is correct for both custom and default-mode services**

1. Repeat J1 for a booking made against a "default %" service (Service 2), not just the "custom amount" one — confirm the balance is price minus the _actual computed_ deposit, not price minus zero (this was a specific bug the final review caught in the shop calendar).

---

## K. Security spot-checks (optional, more technical)

**K1 — The deposit webhook rejects unauthenticated calls**

1. If you're comfortable with a raw HTTP tool (curl/Postman), send a POST request directly to `/api/mollie-connect/webhook` with a fake `id` and no token.
2. If `MOLLIE_CONNECT_WEBHOOK_SECRET` is set, confirm you get a `401 unauthorized` response, not a `200`.

**K2 — A real webhook call (from Mollie itself, carrying the correct token) still works**

1. Just confirm C1's flow worked end-to-end — if the confirmation email and status flip happened correctly, the real webhook call succeeded despite K1's rejection of a fake one.
