# Week 3 Booking Hardening — Handover to Next Session

> Context ran out at 67% on the session that did all of this. This doc is the pickup point. Read this first, then the two source docs it builds on: `2026-09-02-week3-booking-hardening.md` (the implementation plan) and `2026-09-02-week3-e2e-test-cases.md` (the manual test matrix).

## Where things stand

**All 15 implementation tasks from the Week 3 plan are shipped and committed.** All migrations are applied to the linked Supabase project (`jlvvbbnlsfzmtoogwtpm`). The full manual E2E test matrix (sections A through K) has been run — mostly by directly simulating server calls (curl against the live endpoints, direct SQL for setup/teardown) rather than clicking through the browser, since that let us test concurrency/race cases (E1, F1) that are hard to trigger by hand. Every section passed, with two real bugs found and fixed along the way (see below). One UX gap (J2) was found, flagged to the user, and deliberately deferred — user plans to fix it later, tracked in memory.

## Real bugs found and fixed this session (beyond the original plan)

1. **`connect-webhook.ts` missing `testmode=true` on the GET re-fetch.** Mollie's OAuth API 404s a test-mode payment on GET unless `testmode=true` is explicitly passed — even though `checkout.ts` correctly sent `testmode: true` on the POST that created it. This caused deposit-paid bookings to get stuck forever on "Confirming your payment…". Fixed in `src/shop/payments/server/connect-webhook.ts`.
2. **Same gap in `refund.ts`.** POST to `/payments/{id}/refunds` was also missing `testmode: true` in the body. Fixed in `src/booking/server/refund.ts`.
3. **`PublicBookingFlow.tsx` review-step CTA/notice gated on the wrong number.** It checked `selectedService.price_cents > 0` (the full price) instead of `resolvedDepositCents > 0` (the actual deposit due), so a no-deposit service with a nonzero price showed "Pay via iDEAL €200" instead of "Confirm booking" — even though the underlying booking logic correctly skipped payment. Fixed.

## UX/UI work done this session (beyond the original plan — user-directed)

Two rounds of "audit first, then implement on approval" for the **public booking flow** (`PublicBookingFlow.tsx`):
- Round 1: deposit badges on the service picker (`€10 deposit` / `No deposit`), sidebar deposit styled distinctly (same weight as total, primary color), review step explicitly states deposit-now + remaining-at-appointment, "Pay via iDEAL" → "Pay Now" (was misleading — Mollie isn't only iDEAL).
- Round 2 (minimal polish): fixed two hardcoded-Dutch strings that leaked into English-locale sessions ("wordt toegewezen" for auto-assigned staff), locale-aware field placeholders, added an icon to the "any available" staff card for visual consistency.

Then a **shop-owner calendar audit** (`ShopCalendarPage.tsx` + `DayTimeGrid.tsx` + `WeekTimeGrid.tsx` + `RescheduleSheet.tsx` + `BookingCard.tsx` + `occupancy.ts`), which surfaced two big things:

### 1. Manual-booking feature-scope questions — sent to the client, awaiting reply
The audit found that shop owners can create bookings manually (no payment involved — confirmed correct), but several existing actions look unintentional or under-designed:
- Status dropdown (Confirmed/Completed/Cancelled/No-show) is a bare one-column DB write — no business logic attached to any transition.
- "Delete" is a **hard delete** — `payments.booking_id` is `ON DELETE SET NULL`, so a paid deposit's payment record survives but becomes orphaned/anonymous (can't tell who it was for), and the customer's `total_spent`/`last_visit` silently roll back.
- No linkage at all between cancelling/deleting a booking and its payment — a shop owner can cancel a €40-deposit booking and the money just sits captured with zero prompt to refund.

We drafted a message to the client (see prior turns / the user's own copy of it) covering:
- Should shop owners be able to create bookings manually at all? (no payment involved either way)
- Should they be able to cancel? If so, what happens to a captured deposit?
- Confirmed → should trigger a customer email, not just a silent status flip.
- Completed → should probably only be settable after the appointment time has passed.
- No-show → is this even a shop-owner-settable status, or customer-side only?
- Delete → should never be a true hard-delete, only soft-cancel (this one doesn't need a client answer, it's just correct).
- Reschedule → should shop owners have this at all? If yes, needs a customer-facing email (currently sends none).

**The user said the client has now replied — next session should start by grilling through what the client said and what to actually build, per the user's message.** No new code should be written against these questions until that discussion happens.

### 2. Calendar page technical audit → two large fixes already shipped, one UX pass still pending
The audit found (and this session then fixed, fully, both confirmed via typecheck + all 322 unit tests passing):
- **Timezone**: the entire shop-owner calendar UI (display, grid positioning, create/edit form input, drag/resize/keyboard-reschedule, day/week boundaries) was operating in raw UTC, completely disconnected from the shop's actual `shops.timezone` — while the customer-facing side and the DB triggers were already correctly shop-tz-aware. This was a severe bug (booking times shown to shop owners could be off by the full UTC offset, e.g. 5 hours for `Asia/Karachi`). Fixed across `ShopCalendarPage.tsx`, `DayTimeGrid.tsx`, `WeekTimeGrid.tsx`, `RescheduleSheet.tsx`, `BookingCard.tsx`, `occupancy.ts`, `format.ts` (`formatTime` now takes an optional `shopTz` param) — reusing the existing `shop-timezone.ts` toolkit (`shopLocalToUtc`, `utcToShopLocal`, `shopLocalDayBoundsUtc`, `shopTodayYmd`, `formatInShopTz`) that already powered the public flow.
- **Language-mixing**: found and fixed ~35 hardcoded-Dutch strings (plus a hardcoded `"nl-NL"` locale bug) across `ShopCalendarPage.tsx`, `DayTimeGrid.tsx`, `WeekTimeGrid.tsx`, `RescheduleSheet.tsx` — none of this went through `t()` before. Added ~35 new translation keys to both `en.ts`/`nl.ts`, reusing existing keys wherever an exact match already existed. Cross-checked every `calendar.*` key actually used against both locale files — full coverage confirmed.

**What's still open from the calendar audit: the actual visual/interaction UX pass.** The technical audit (what data is shown, which statuses, view modes, timezone correctness, language coverage) is done and fixed. A design/UX improvement pass on the calendar page itself (similar in spirit to what was done for `PublicBookingFlow.tsx` — audit findings, discuss, get approval, implement) has **not** happened yet. This is explicitly what the user wants to pick up next, after the client-response discussion.

## Known, deliberately-deferred items (don't re-discover these, they're already tracked)

All of these are saved in the auto-memory system (`C:\Users\zubai\.claude\projects\D--projects-jidat-apppoint-craft\memory\`) — check `MEMORY.md` at the start of the new session, it'll load automatically, but flagging here for context continuity:

- **Balance display gap (J2)**: `ShopCalendarPage.tsx`'s "remaining balance" line shows the full price (not hidden/€0) on bookings that never had a deposit at all, duplicating the "Bedrag" line above it. Matches the plan's own spec, but the E2E test doc expected different behavior. User said they plan to fix this later — proposed fix (not yet applied): gate on `booking.deposit_cents > 0 && remainingBalanceCents > 0` instead of just the latter.
- **Refund/cancellation policy gaps** (found during the refund-mechanics audit, not yet acted on, separate from the manual-booking questions above): no chargeback/dispute handling at all (`mapMollieStatus` doesn't recognize `charged_back`); refund never emails the customer; refund doesn't claw back the platform's application fee; no customer self-service cancellation exists anywhere in the app. These were raised as open design questions in a broader "how should the whole cancellation/refund journey work" discussion — not yet resolved, not blocking, but worth surfacing again if the client's reply touches on any of this.
- **Bilingual-coverage discipline**: standing instruction from the user — whenever editing or auditing any file, proactively check for and fix hardcoded-language issues in the same pass, don't wait to be asked file-by-file.

## Environment / test setup notes (for continuity, in case new session needs to re-verify anything)

- Local dev exposed via ngrok at `https://hot-bernie-weirdly.ngrok-free.dev` (may have rotated — check `.env` / running tunnel).
- Supabase project ref `jlvvbbnlsfzmtoogwtpm` (per `supabase/config.toml`), linked via `npx supabase db query --linked "<sql>"` for direct DB inspection/mutation during testing — this was the primary tool used for E2E verification all session (creating synthetic bookings/payments, checking table state, cleaning up afterward).
- Shop A (test234, `ed671e6c-3de9-4e08-ab0b-892bf72fa1c7`) — Mollie connected, timezone `Asia/Karachi`, used for most positive-path tests.
- `MOLLIE_CONNECT_WEBHOOK_SECRET` and `MOLLIE_WEBHOOK_SECRET` are currently the **same value** in local `.env` — functionally fine, but defeats the isolation the plan intended (not leaking the platform secret to a merchant's own Mollie dashboard). Worth a distinct value before this goes further than local testing — flagged once already, not fixed (out of scope, cosmetic/hygiene, not a bug).
- No autonomous git commits — the user reviews and commits everything himself (standing rule, already in memory).

## Suggested opening move for the next session

Wait for the user to paste/describe the client's reply, then work through it as a discussion (grill-style, per the user's own words) before writing any code — same pattern this session used throughout (audit → discuss → approve → implement, never skip straight to code). Once that's resolved, move to the calendar page's visual/interaction UX pass.
