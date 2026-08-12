# Public booking page — developer notes

Implementation lives primarily in `src/components/PublicBookingFlow.tsx`, used by `/book` and `/book/$slug`.

## Product rules (locked)

| Topic | Decision |
|---|---|
| No active staff | Empty state on staff step; hide “Any available”; Continue blocked |
| Slot window | **Intersection**: shop `business_hours` ∩ staff `working_hours` − breaks − bookings |
| Any available | Slot OK if **≥1** eligible staff is in hours and free |
| Missing shop hours | Treat as closed / not bookable |
| New shop create | Persist default business hours; **timezone + category chosen on onboarding** (TZ prefilled from browser, fallback `Europe/Amsterdam`) |
| Missing staff structured hours | That staff not bookable that day |
| Empty times copy | Generic `book.noTimes` (“No available times on this day.”) |
| Calendar greying | Disable day if shop closed/missing **or** no selected/any-eligible staff has a bookable intersection window |
| Wall-clock meaning | Always **shop local** (`shops.timezone`), never customer browser TZ |
| Default IANA TZ | `Europe/Amsterdam` (`DEFAULT_SHOP_TIMEZONE`) |
| Payments / Mollie | **Out of scope this week** (Week 3) |

## Timezone (source of truth)

Library: **`date-fns-tz`** (paired with existing `date-fns`).

Helpers in `src/lib/shop-timezone.ts`:

| Helper | Role |
|---|---|
| `shopLocalToUtc(dateYmd, hhmm, shopTz)` | Slot / submit → UTC instant |
| `utcToShopLocal(utc, shopTz)` | Display / validation parts |
| `shopLocalDayBoundsUtc(dateYmd, shopTz)` | Inclusive UTC range for availability RPCs |
| `shopTodayYmd(shopTz)` | “Today” / past-day greying in shop TZ |
| `formatInShopTz` / `civilDateYmd` / `dayKeyFromYmd` | Display + weekday |

Staff helpers (`src/lib/staff-availability.ts`) use these — no `getUTCHours` / UTC-noon weekday tricks for public booking.

## Data sources

| Data | Source |
|---|---|
| Services | `servicesQuery(shopId)` |
| Staff | `staffQuery(shopId)` (`select *` includes `working_hours`) |
| Staff ↔ service | `staff_services` (fallback: all active staff if no mappings) |
| Shop hours | `shops.business_hours` |
| Shop TZ | `shops.timezone` (fallback `Europe/Amsterdam`) |
| Existing bookings | RPC `get_public_bookings_for_availability` with **shop-local day bounds** as UTC |
| Staff hours helper | `resolveStaffAvailabilityForDayKey` |

## Slot algorithm (client)

1. Civil date from the picker → `civilDateYmd` (the day the customer clicked).
2. Shop open/close for that YMD via `dayKeyFromYmd` + `business_hours`.
3. 30-minute candidates in **shop-local minutes**; each candidate → `shopLocalToUtc` for past/conflict checks.
4. Clamp staff hours with `resolveStaffAvailabilityForDayKey`.
5. Bookings query uses `shopLocalDayBoundsUtc` → RPC timestamptz range.

## Public booking RPCs — audit (already shipped)

Implemented in `supabase/migrations/20260812071513_shop_owner_role_and_public_booking_rpcs.sql`:

| RPC | Params | TZ awareness |
|---|---|---|
| `get_public_bookings_for_availability` | `_shop_id`, `_range_start timestamptz`, `_range_end timestamptz` | **Already correct** if client passes shop-local day bounds as UTC (now done via `shopLocalDayBoundsUtc`) |
| `get_public_busy_staff_ids` | `_shop_id`, `_starts_at`, `_ends_at` timestamptz | Absolute interval — **no change**; client must pass shop-local→UTC instants (now done on submit) |
| `public_booking_staff_has_conflict` | same | Absolute interval — **no change**; same as above |

### Follow-up patch (optional, not required for this fix)

No RPC signature change is required for correctness. Optional later improvements:

1. Accept `_date_ymd date` + resolve bounds inside SQL with `shops.timezone` (server-enforced day window; harder to misuse from clients).
2. Document that callers **must not** build `_range_start`/`_range_end` with browser-local `new Date('YYYY-MM-DDT00:00:00')`.

Do **not** silently rework these RPCs in this slice — client now supplies correct UTC bounds/instants.

## Shop calendar note

In-app `DayTimeGrid` / `WeekTimeGrid` still model wall-clock as UTC (legacy). Their `validateBookingSlot(..., "UTC")` calls preserve that until a dedicated calendar TZ migration. Public booking does **not** use that path.

## Empty / UX states

- Services / staff empty states + `book.noTimes`
- Preset shop: Back disabled on service step

## Related files

- `src/lib/shop-timezone.ts` — TZ SSOT
- `src/lib/staff-availability.ts` — hours / breaks
- `src/components/PublicBookingFlow.tsx` — wizard
- `src/routes/book.confirmation.$bookingId.tsx` — shop-local display
- `docs/PublicBooking/CLIENT.md` — client-facing summary
