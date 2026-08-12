# Public booking page — developer notes

Implementation lives primarily in `src/components/PublicBookingFlow.tsx`, used by `/book` and `/book/$slug`.

## Product rules (locked)

| Topic | Decision |
|---|---|
| No active staff | Empty state on staff step; hide “Any available”; Continue blocked |
| Slot window | **Intersection**: shop `business_hours` ∩ staff `working_hours` − breaks − bookings |
| Any available | Slot OK if **≥1** eligible staff is in hours and free |
| Missing shop hours | Treat as closed / not bookable |
| New shop create | Persist `DEFAULT_SHOP_BUSINESS_HOURS` (`src/lib/staff-availability.ts`) — same defaults as Settings UI |
| Missing staff structured hours | That staff not bookable that day |
| Empty times copy | Generic `book.noTimes` (“No available times on this day.”) |
| Calendar greying | Disable day if shop closed/missing **or** no selected/any-eligible staff has a bookable intersection window |
| Approach | Client-only; reuse `@/lib/staff-availability` |

## Data sources

| Data | Source |
|---|---|
| Services | `servicesQuery(shopId)` |
| Staff | `staffQuery(shopId)` (`select *` includes `working_hours`) |
| Staff ↔ service | `staff_services` (fallback: all active staff if no mappings) |
| Shop hours | `shops.business_hours` |
| Existing bookings | RPC `get_public_bookings_for_availability` |
| Staff hours helper | `resolveStaffAvailability` from `@/lib/staff-availability` |

## Slot algorithm (client)

1. Resolve shop open/close for the calendar day (`shopHoursForDay`). No open/close → no slots.
2. Build 30-minute candidates from shop open → close that fit service duration.
3. Clamp each candidate staff’s `working_hours` to the shop window via `resolveStaffAvailability(..., shopOpen, shopClose)`.
4. Keep a time only if ≥1 candidate fully fits a working window and does not overlap breaks.
5. Mark `available: false` when in the past or overlapping that staff’s bookings (“any” = any in-hours staff free).

Calendar `disabled` uses the same shop∩staff window check (`isDayBookable`), plus past / +90 days.

## Empty / UX states already in this pass

- Services: `EmptyState` + `book.noServices` / `book.noServicesSub`
- Staff: `EmptyState` + `book.noStaff` / `book.noStaffSub`
- Times: `book.noTimes` when `slots.length === 0`
- Preset shop (`presetShopId`): Back disabled on service step (`logicalStep === 1`)

## i18n keys

- `book.noServices`, `book.noServicesSub`
- `book.noStaff`, `book.noStaffSub`
- `book.noTimes`

(EN + NL in `src/lib/translations/en.ts` / `nl.ts`)

## Authority / caveats

- DB triggers (e.g. outside staff hours) remain authoritative on insert.
- Public slot math is advisory UI aligned with shop calendar helpers; timezone edge cases still use local calendar day + UTC-noon weekday trick for `resolveStaffAvailability`.
- No new RPC in this slice. A dedicated public availability RPC remains a possible follow-up.

## Related files

- `src/components/PublicBookingFlow.tsx` — wizard UI + slot engine
- `src/components/EmptyState.tsx` — shared empty UI
- `src/lib/staff-availability.ts` — working hours / breaks
- `src/routes/book.tsx`, `book.$slug.tsx`, `book.index.tsx` — routes
- `docs/PublicBooking/CLIENT.md` — client-facing summary
