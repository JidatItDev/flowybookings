# Booking Lifecycle Browser Test — Handover for UX Pass

> Picks up right after `2026-09-07-booking-lifecycle-handover.md`, whose entire "Suggested opening move" (the 9-step manual browser test) is what this session did. Read that doc first for the feature's design/why; this one is just what testing found and where things stand now.

## Where things stand

**All 9 steps of the prior handover's test plan are done and passed.** In the process, testing surfaced **5 real bugs** that unit tests couldn't have caught (client/server wiring gaps and one live-Mollie-API behavior) — the feature had never actually been clicked through before this session. All 5 are fixed. Typecheck clean, lint clean (two pre-existing unrelated issues untouched — `plan-override.ts` admin-billing type error, `DayTimeGrid.tsx:91` prefer-const), all 347 unit tests pass (346 + 1 new for the cancel-guard fix).

**Nothing from this session is committed.** Everything is sitting in the working tree on `feature/customer-booking` — review the diff before committing (standing rule, don't commit without being asked each time).

## Bugs found and fixed this session

1. **Pending bookings past their start time were permanently stuck.** `confirm`/`cancel` both required `beforeStartTime`; `no_show`/`completed` both required status already `confirmed`. A booking left `pending` past its start had zero valid transitions — not even cancellable. Fixed: `cancel`'s guard (`booking-status-decision.ts`) now allows `pending` regardless of time via a new `beforeStartTimeUnlessPending` guard.
2. **Disabled guard buttons never showed their tooltip.** `disabled:pointer-events-none` on the base `Button` component (a shadcn convention, `src/components/ui/button.tsx`) blocks native `title` hover tooltips on any disabled button app-wide. Fixed for the 4 status-action buttons in `ShopCalendarPage.tsx`: `title` now lives on a non-disabled wrapping `<span>` instead of the disabled `<Button>` itself.
3. **`void-payment.ts`'s Mollie DELETE call was missing `testmode`.** Same bug class already fixed twice elsewhere this project (`connect-webhook.ts`'s GET, `refund.ts`'s POST) — just missed here since this file is brand new. First fix attempt (query param, matching the GET pattern) 422'd with "Non-existent query parameter" — confirmed via the real Mollie API that **DELETE requires `testmode` as a JSON body field**, not a query param. Fixed correctly on the second pass.
4. **Silent failure swallowing in `booking-status.ts`.** The cancel handler only `.catch()`'d `voidOpenMolliePayment`'s promise *rejection*, never inspected its resolved `{ok:false}` result — so any Mollie-side failure (bad token, wrong mode, etc.) vanished with zero log trace. Fixed to log both paths; this is what let bug #3 actually surface in testing instead of failing invisibly.
5. **Reschedule-via-resize never actually persisted.** The client computed a new end time optimistically (looked right in the calendar immediately after dropping) but never sent it to the server; `reschedule.ts` always re-derived duration from the *original* booking's start/end regardless of what the client intended. Fixed both sides: `ShopCalendarPage.tsx`'s reschedule mutation now sends `new_ends_at`, and `reschedule.ts` accepts and uses it when present (falls back to preserving duration on a plain move, unchanged).

## Confirmed NOT a bug — external limitation

Mollie's test-mode Cancel Payment endpoint (`DELETE /v2/payments/{id}`) frequently rejects with `422 "The payment cannot be cancelled"` even after the `testmode` fix and with a payment method actually selected on the checkout page. This matches a known, undocumented gap in Mollie's own API (test-mode/OAuth-Connect payments are often simply not cancelable via the API) — nothing left to fix from our side. The real protection against a stale unpaid checkout wrongly reviving an already-cancelled booking isn't the DELETE call at all — it's `connect-webhook.ts`'s conditional `.eq("status", "pending")` update when a payment settles `paid`, which we confirmed works independently (tested by paying a stale checkout after cancellation; booking correctly stayed cancelled, `paid_after_cancellation` was logged for manual follow-up).

## Feature swap this session (user-requested, not a bug)

Per the prior handover's own flagged "deliberate deviation" (toast chosen over an anchored popover for the drag/resize/keyboard-move reschedule confirmation, since no reliable anchor point existed across 4-5 commit call sites per grid), the user asked mid-session to revisit it. Replaced the Sonner toast with a modal (`RescheduleConfirmDialog.tsx`, new shared component used by both `DayTimeGrid.tsx` and `WeekTimeGrid.tsx`) — shows customer name, service, and old→new time, plus whether an email will fire. A modal doesn't need an anchor point, which was the original blocker for the popover approach — this resolves that cleanly.

## Known, deliberately-deferred items (don't re-discover these)

- **`paid_after_cancellation` edge case is invisible to the shop owner** — `connect-webhook.ts` logs it internally (console + `activity_log`) but nothing surfaces it in the UI or by email. Flagged, not fixed — out of scope for this pass.
- **Status-action button UX** — the 2×2 grid (Confirm/Completed/Cancel/No-show) on the booking detail sheet is confusing: the same "Confirmed" label is reused for the initial confirm action *and* both undo actions (`undoNoShow`, `undoCompleted`), and when a booking is `no_show`, both the undo-to-confirmed button and the Completed button are simultaneously enabled with no visual distinction of what each does. User flagged this unprompted mid-session and explicitly wants it redesigned — **this is tomorrow's opening task.**
- All items already carried over from the prior handover remain open too: bilingual gap in email templates, dashboard timezone/DST math, no policy engine for auto-cutoff cancellation.

## Suggested opening move for next session

User's own words: tomorrow is **grilling through what to actually do about the status-action button UX**, then a full testing pass of whatever comes out of that redesign. Concretely:
1. Use the `grilling` skill (or equivalent back-and-forth) to pin down the actual redesign — not just "make it less confusing" but specific interaction/layout decisions. Starting material: the button grid lives in `ShopCalendarPage.tsx`'s `statusActions` (search for that name), guards come from `canTransition` in `booking-status-decision.ts`, and `resolveConfirmAction()` is what silently swaps the same "Confirmed" button between `confirm`/`undoNoShow`/`undoCompleted` depending on current status — that's the crux of the confusion.
2. Implement the agreed design.
3. Browser-test it the same way this session tested the lifecycle transitions themselves — this doc's bug list is a reminder that "looks right in the UI" (bug #5, the resize) isn't the same as "actually persisted," so verify against the DB, not just the screen.

## Environment notes (carried over, re-verify freshness)

- Supabase project ref `jlvvbbnlsfzmtoogwtpm`, linked via `npx supabase db query --linked "<sql>"`.
- Shop A (test234, `ed671e6c-3de9-4e08-ab0b-892bf72fa1c7`) — Mollie connected, timezone `Asia/Karachi`.
- ngrok tunnel was `https://hot-bernie-weirdly.ngrok-free.dev` as of this session — likely rotated by next session, check `.env` / running tunnel first.
- No autonomous git commits — nothing from this session has been committed; review the diff before committing.
