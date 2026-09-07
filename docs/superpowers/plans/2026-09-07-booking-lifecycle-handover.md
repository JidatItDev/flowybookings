# Shop-Owner Booking Lifecycle — Handover for Browser Testing

> This is the pickup point after implementing the client's manual-booking-management sign-off (Confirm/Cancel/Reschedule/No-show/Completed statuses + independent Refund). Design was fully worked out in conversation first — read `CONTEXT.md` (root) and `docs/adr/0001-cancellation-and-refund-are-independent.md` before touching any of this code; they're the settled source of truth for *why* things work this way, not just what.

## Where things stand

**Fully implemented, migrations pushed and applied, typecheck clean, all 346 tests pass** (322 pre-existing + 24 new for the decision layer). Supabase types (`src/integrations/supabase/types.ts`) were regenerated after the migration push — do not hand-edit that file, regenerate via `npx supabase gen types typescript --linked` if schema changes again.

**Not yet done: any actual browser testing.** Everything below is implemented and passes automated checks, but nothing has been clicked through in a live browser session yet. That's the next step — see "Suggested opening move."

## What was built

### Backend (all new)
- `src/booking/server/booking-status-decision.ts` — pure state machine (transition table + guards: `beforeStartTime`, `afterStartTime`, `afterEndTime`, `noOpenPayment`). Zero I/O, mirrors the existing `booking-expiry-decision.ts` pattern. Reused **client-side too** (in `ShopCalendarPage.tsx`) for button disablement/tooltips — single source of truth for the guard logic, not duplicated.
  - Tests: `src/booking/server/__tests__/booking-status-decision.test.ts` (24 cases, exhaustive per-action/per-guard boundary coverage).
- `src/booking/server/booking-status.ts` — `POST /api/bookings/status`. Handles Confirm/Cancel/No-show/Completed + their undos. Auth pattern copied from `refund.ts` (Bearer token → shop-ownership check). Guarded update (`.eq("status", fromStatus)`), then fires email + activity_log.
- `src/booking/server/reschedule.ts` — `POST /api/bookings/reschedule`. Reuses `beforeStartTime` from the decision layer. Forwards raw Postgres error fields on a DB-trigger rejection (conflict/working-hours) so the existing `classifyBookingError`/`bookingErrorToast` (`src/booking/lib/booking-errors.ts`) keep working unmodified client-side.
- `src/booking/server/void-payment.ts` — voids a still-open (`unpaid`) Mollie payment when Cancel fires, via `DELETE /v2/payments/{id}`. **This is the single least-verified piece of the whole build** — the DELETE-to-cancel semantics were never exercised against Mollie's actual test-mode API before now, only reasoned about from Mollie's docs. Test this first.
- `src/email/server/booking-cancelled.ts`, `src/email/server/booking-rescheduled.ts` — new senders via the real `sendEmail()`/`email_templates` pipeline (not the legacy `enqueueBookingEmail` React-Email path — don't confuse the two, `booking-confirmation.ts` already uses `sendEmail()` too).
- Two migrations: `20260907150000_booking_status_columns.sql` (`bookings.cancellation_reason`, `bookings.cancelled_at`) and `20260907150500_booking_status_email_templates.sql` (`booking-cancelled`/`booking-rescheduled` template rows). Both confirmed applied to `jlvvbbnlsfzmtoogwtpm`.
- No new audit table — reused the existing `activity_log` table (same one `checkout.ts`/`refund.ts` already write to).

### Frontend
- `ShopCalendarPage.tsx`: removed the hard-delete "Delete" action entirely (folded into Cancel, per the ADR). `updateStatus`/`reschedule` mutations now call the new server routes instead of raw `supabase.from("bookings").update(...)`. New shared confirm dialog for Confirm/Complete/No-show/Cancel (Cancel's variant has a required free-text reason textarea +, when a `paid`/`deposit_paid` payment exists, an inline amount + Refund shortcut). Refunded badge next to the amount row. The list-row view's raw status `<Select>` was removed too (it bypassed every new guard) — replaced with a read-only `StatusBadge`; status changes only happen through the detail sheet now.
- `DayTimeGrid.tsx` / `WeekTimeGrid.tsx`: drag, resize, and keyboard-move all funnel through a new `proposeReschedule` step before committing.
- `src/shop/payments/useRefundAction.ts` + `RefundConfirmDialog.tsx` — extracted from `MollieConnectPayments.tsx` so the Payments page and the calendar's Cancel-dialog shortcut share one refund flow.

### One deliberate deviation from the original plan
The plan called for an **anchored popover** on drag/resize/keyboard-move confirmation. Once inside the grid components, there turned out to be 4-5 separate commit call sites per grid (mouse drop, touch drop, keyboard commit, resize commit) with no reliable shared anchor point. Used a **Sonner toast with Confirm/Cancel action buttons** instead — functionally identical ("declining costs nothing, nothing was ever written until Confirm"), but treats all gesture types uniformly instead of needing bespoke positioning per interaction. If this reads as low-rent in testing, revisiting it into something more visually anchored is a pure UI polish task, not a re-architecture.

## Known, deliberately-deferred items (don't re-discover these)

- **Bilingual gap in the confirmation email template is NOT fixed** — `booking-confirmation`/`booking-cancelled`/`booking-rescheduled` are all still 100% hardcoded Dutch (`lang="nl"` in `email_templates` rows). Explicitly deferred to a separate pass, per direct instruction — don't fix it as a drive-by while testing this feature.
- **Dashboard timezone bugs** (`ShopDashboardPage.tsx`, `OccupancyCard.tsx` — raw UTC day-boundary math) and **DST edge case** in the grid's day-boundary math — both explicitly deferred to a future app-wide timezone pass, not part of this feature.
- **No policy engine** — refund/cancel are always manual, single actions. This was an explicit Phase-1 scope cut (see the ADR's last paragraph), not an oversight — don't build an auto-cutoff-window feature without checking with the user first.

## Suggested opening move: browser test plan

Work through these in order, since later ones depend on earlier ones producing test data:

1. **Manual booking creation** (baseline, should be unchanged) — create a booking with no deposit required; confirm it lands `pending`.
2. **Confirm, no payment in play** — click Confirm on that pending booking. Verify: status flips to `confirmed`, a confirmation email row appears in `email_send_log`, an `activity_log` row appears (`entity: booking, action: confirm`).
3. **Confirm, payment in-flight (the risky one)** — create/simulate a booking with a deposit required and an open Mollie test-mode payment still `unpaid`. Confirm the "Confirm" button is disabled with the "waiting for online payment" tooltip. This is the guard most worth stress-testing since it's new logic protecting against handing out a slot before payment lands.
4. **Cancel with an open (never-paid) deposit** — cancel a `pending` booking that has an `unpaid` Mollie payment. Verify the Mollie payment actually gets voided (check its status via Mollie's dashboard/API, and check the local `payments` row flips to `failed` with `metadata.reason: "booking_cancelled"`) — **this exercises the untested `void-payment.ts` DELETE call**, watch it closely.
5. **Cancel with a captured deposit** — cancel a `confirmed` booking with a `paid`/`deposit_paid` payment. Verify the payment is untouched (still `paid`), the Cancel dialog showed the captured amount + Refund shortcut, and clicking that shortcut opens the same Refund dialog as the Payments page.
6. **Reschedule via drag** — drag a booking to a new slot in Day and Week view. Verify the toast appears, Cancel snaps back with no server call, Confirm commits and (only when the start time actually changed) sends the reschedule email.
7. **Reschedule via resize** — resize a booking's duration. Verify the confirm toast still appears but **no email fires** (same start time).
8. **No-show → Completed → undo both** — mark no-show after start time (should be blocked before start time), mark completed after end time (should be blocked before), then undo each back to confirmed via the same "Confirmed" button and confirm `customers.total_spent_cents`/`last_visit_at` self-correct (check via `npx supabase db query --linked` against the `customers` row).
9. **List view row click** — confirm the row's status now shows as a plain badge (no dropdown) and clicking the row still opens the full detail sheet with all guarded actions.

## Environment notes (carried over from the prior handover, re-verify freshness)

- Supabase project ref `jlvvbbnlsfzmtoogwtpm`, linked via `npx supabase db query --linked "<sql>"` for direct inspection.
- Shop A (test234, `ed671e6c-3de9-4e08-ab0b-892bf72fa1c7`) — Mollie connected, timezone `Asia/Karachi`, used for most positive-path tests previously.
- ngrok tunnel URL from the last session may have rotated — check `.env` / running tunnel before testing anything Mollie-webhook-dependent.
- No autonomous git commits — nothing from this session has been committed; review the diff yourself before committing.
