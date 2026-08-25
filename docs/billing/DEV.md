# Platform billing — developer notes

Covers FlowyBookings' **platform subscription billing**: charging shop owners for Starter/Pro/Premium plans via Mollie (FlowyBookings' own Mollie account). This is separate from **Mollie Connect**, the per-shop payout OAuth used for booking deposits — Connect is out of scope for everything below.

Work spans two sessions (2026-08-24 and 2026-08-25) on branch `feature/platform-billing`.

## Data model

No dedicated `subscriptions` table. Billing state lives on `shops` columns, plus rows in the generic `payments` table.

| Column (`shops`) | Meaning |
|---|---|
| `plan` | `trial \| starter \| pro \| premium` (Postgres enum, exactly 4 values) |
| `plan_billing_cycle` | `'monthly' \| 'yearly' \| null` |
| `plan_expires_at` | End of the current paid-through period (trial expiry too) |
| `subscription_status` | `trial \| active \| cancelled \| payment_failed \| none \| expired` (free text, validated by trigger) |
| `pending_plan` | Scheduled plan change, applied at `pending_plan_effective_at` |
| `pending_billing_cycle` | Scheduled cycle change, applied alongside `pending_plan` |
| `pending_plan_effective_at` | When the pending change lands |
| `mollie_customer_id` / `mollie_subscription_id` | Mollie's own IDs for this shop |
| `payment_failed_at` | Start of the 7-day payment-failed grace window |
| `next_billing_at` | Next expected Mollie charge |

`payments` rows for platform billing use `provider = 'platform_mollie'`, `booking_id IS NULL`. `plan_pricing` (admin-editable, RLS-gated to `super_admin`) is the live source of truth for prices — `monthly_price_cents` per plan, read via `fetchPlanPriceCents()`, not the hardcoded fallback map in `platform-billing.ts` (that fallback is client-safe-only, used for display before `plan_pricing` loads; never for anything that charges money).

## Core files

| File | Role |
|---|---|
| `src/shop/billing/server/plan-checkout.ts` | Immediate action: new/upgrade checkout, real Mollie payment (`sequenceType: "first"`), redirects to Mollie |
| `src/shop/billing/server/plan-downgrade.ts` | Deferred action: schedules `pending_plan`/`pending_billing_cycle`, **never touches Mollie** |
| `src/shop/billing/server/plan-downgrade-cancel.ts` | Clears a scheduled downgrade — pure DB write, no Mollie call needed |
| `src/shop/billing/server/plan-cancel.ts` | Full cancel — cancels the live Mollie subscription, sets `subscription_status: 'cancelled'`, clears pending fields |
| `src/shop/billing/server/billing-expiry.ts` | Cron: applies due pending plan/cycle changes (patches Mollie **here**, at the real renewal boundary); sweeps lapsed shops to `plan: starter, subscription_status: none` |
| `src/shop/billing/server/billing-reconcile.ts` | Cron: replays any Mollie payments whose webhook got missed — never creates/charges payments itself |
| `src/shop/payments/server/mollie-webhook.ts` | Receives Mollie's webhook, the single place that actually activates a plan on `paid` |
| `src/shop/billing/server/mollie-subscriptions.ts` | Low-level Mollie subscription CRUD (`ensureSinglePlatformSubscription`, patch/create/cancel) |
| `src/shop/billing/server/plan-downgrade-decision.ts` | Pure logic: `resolvePlanChangeDirection`, `resolveDowngradeCancelPreflight` |
| `src/shop/billing/server/expiry-sweep-decision.ts` | Pure logic: expiry-sweep branching |
| `src/shared/lib/trial.ts` | Client-side mirror of the booking-block rules (`getTrialState`) |
| `src/shop/billing/UpgradePage.tsx` (routes: `/shop/billing`, alias `/shop/upgrade`) | The one page for everything: current-plan summary, pricing tiles, upgrade/downgrade/cycle-switch actions, all confirm dialogs |
| `src/shop/billing/ShopBillingCard.tsx` | Plan/status summary + payment history + cancel action, embedded in `UpgradePage` |
| `src/shop/shell/TrialBanner.tsx` | Site-wide banner (trial countdown, payment-failed, lapsed, cancelled-but-active) |
| `src/shop/shell/ShopLayout.tsx` | Sidebar nav lock + full dashboard redirect when there's no live subscription |

**No mock/test billing path exists** — missing Mollie keys return `503 server_configuration_missing`. `plan-confirm.ts` (an old mock-billing confirm endpoint) always returns `410`.

## Plan/cycle change rules (locked)

One rule covers both tier and billing-cycle changes: **anything that increases commitment happens immediately and is charged in full now; anything that decreases it is deferred to the end of the period already paid for.** `resolvePlanChangeDirection(current, target)` in `plan-downgrade-decision.ts` is the single source of truth.

| Change | Direction | Mechanism |
|---|---|---|
| Trial → any paid plan | Immediate | `plan-checkout.ts`, real Mollie payment |
| Lower tier → higher tier (any cycle) | Immediate | `plan-checkout.ts` |
| Higher tier → lower tier (any cycle) | Deferred | `plan-downgrade.ts`, applies at `plan_expires_at` |
| Same tier, monthly → yearly | Immediate | `plan-checkout.ts` (full annual price charged now) |
| Same tier, yearly → monthly | Deferred | `plan-downgrade.ts` (keeps yearly access until term ends) |
| No proration, ever | — | Explicit product decision — upgrades always charge full new price, downgrades never credit unused time |

## The premature-charge bug (fixed 2026-08-25)

`ensureSinglePlatformSubscription()`/`patchMollieSubscription()` always includes `interval` in its PATCH body to Mollie. Empirically (confirmed in Mollie test mode), **Mollie resets a subscription's next-payment schedule to "now" whenever a PATCH includes `interval`, even when the value doesn't change** — but only on a subscription that has never yet had a real charge fire; once it has one real charge in its history, later patches don't reset the schedule.

Original design patched Mollie's subscription **at schedule time** (when the downgrade was requested) so the *next real renewal* would bill the new amount. On a subscription still in that first "never charged" window, this caused an unwanted charge within minutes — verified live: a Pro-yearly→Starter downgrade scheduled a year out instead charged the customer ~10 minutes later.

**Fix:** `plan-downgrade.ts` never touches Mollie. `billing-expiry.ts`'s existing "apply pending plan" cron step now does the Mollie patch, at the moment it actually applies the change — i.e. the real renewal boundary, where "now" and the subscription's natural next-payment date coincide. If the Mollie patch fails there, the local `plan` is **not** flipped that run (retries next cron tick) — this avoids a shop ending up on the new (lower) plan's features while Mollie is still charging the old price.

## Access control: lapsed subscriptions (fixed 2026-08-25)

Found via live QA (a shop's subscription was allowed to lapse, then kept full free access forever). Root cause: `shop_can_accept_bookings()` and `get_shop_feature_access()` (both DB functions) gated purely on `shops.plan`, never checked `subscription_status`. Since `billing-expiry.ts`'s expiry sweep always resets `plan` to `'starter'` (there's no "no plan" enum value) regardless of the shop's real prior tier, a lapsed Pro/Premium shop kept **free indefinite Starter access** with zero enforcement.

**Fix** — `supabase/migrations/20260825120000_lapsed_subscription_block.sql`: both DB functions now block when `subscription_status = 'none'`, no grace period (the grace period, or the paid-until date, already ran out by the time a shop reaches `'none'`). Client-side mirror in `getTrialState()` / `ShopLayout.tsx`: a shop with no live subscription (lapsed paid plan, **or** an expired trial — added for parity) is redirected away from the dashboard entirely (except `/shop/upgrade`, `/shop/billing`, `/support`), sidebar links are visually locked, and `TrialBanner` shows a blocking message. Super admins bypass all of this (impersonation/support must still work on a lapsed shop).

Since `shops.plan` can't be trusted to show what a lapsed shop's *real* last tier was, `use-last-paid-plan.ts` reads it from the last **paid** row in `payments.metadata.plan` instead, and both `ShopBillingCard` and the pricing tiles show that as "Previous plan."

## UI conventions

- All confirmation dialogs use the shared `AlertDialog` (`src/components/ui/alert-dialog.tsx`) — no `window.confirm`/`window.alert` anywhere in the billing UI.
- Every pricing-tile action confirms first, showing a "{current plan} ({cycle}) → {target plan} ({cycle})" summary line plus action-specific text. Immediate actions (checkout-bound) explicitly mention the Mollie redirect; deferred actions (scheduling) don't, since nothing happens off-app.
- The pricing tiles are one grid reused for every action (upgrade, downgrade, resubscribe after lapsing, cycle switch) — state is derived per-tile from `resolvePlanChangeDirection`-equivalent local booleans (`isCurrent`, `isPreviousPlan`, `isPendingTarget`, `isTierDowngrade`, `isCycleDowngrade`, `isCycleUpgrade`), not separate components per action.
- `/shop/billing` is canonical; `/shop/upgrade` is a thin alias route kept for old links/bookmarks.

## Testing

Unit tests cover every pure/extractable decision function (237 tests across 15 files, `npm test`). No test framework existed before this work — Vitest was introduced specifically for this. Integration/E2E tests don't exist; verification is manual, tracked in `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md`.

**Manually verified live** (via ngrok + Mollie test mode against a real Supabase project): trial→paid checkout, recurring renewal paid/failed, cancel, expiry sweep, failed/abandoned upgrade checkout, yearly billing, owner-cannot-write-plan-directly (DB trigger), the lapsed-access block, the downgrade scheduling fix (no premature charge, confirmed via Mollie dashboard), cancelling a scheduled downgrade, and the cron actually applying a pending change. See the matrix doc's Results log for exact dates/notes.

**Not yet manually verified**: the cycle-switch feature end-to-end (code complete, unit-tested, never run live); two original matrix rows (H2 — Starter→Pro paid; F3 — first-subscribe-then-cancel) were never explicitly re-run this round, though they exercise the same code paths as several already-passing cases.

## Known gaps / deliberately deferred

- `mollie-webhook.ts`'s recurring-payment-failure branch logs on error but not on success — observability gap only, the email does send.
- `plan-override.ts:54` — pre-existing TS excess-property-check error, unrelated to billing work, never touched.
- `.env` is still committed to git history (a prior decision to `git rm --cached` rather than rewrite history was made, but the untracking step itself doesn't appear to have actually taken effect — worth a second look if this matters).
- `MOLLIE_WEBHOOK_SECRET` is unset everywhere (flagged, low-priority hardening, not required for correctness since the webhook handler doesn't currently verify it).
- Two migrations from this work are **not yet applied** to the live Supabase project (applied by the team, not by an agent, per this project's working agreement): `20260825120000_lapsed_subscription_block.sql`, `20260825140000_shop_pending_billing_cycle.sql`.
- `src/integrations/supabase/types.ts` and `ShopRow` (`auth-context.tsx`) were hand-edited to add `pending_billing_cycle` (normally auto-generated from the live schema) — worth confirming with `supabase gen types` once the migration is applied.

## Related files

- `.claude/HANDOFF.md` — running session log, most detail on *why* each decision was made.
- `docs/superpowers/plans/2026-08-25-lapsed-subscription-access-block.md` — lapsed-access fix plan.
- `docs/superpowers/plans/2026-08-25-downgrade-premature-charge-fix.md` — premature-charge fix plan.
- `docs/superpowers/plans/2026-08-25-billing-cycle-switch.md` — cycle-switch feature plan.
- `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md` — QA matrix + live results log.
- `docs/billing/CLIENT.md` — plain-language summary of how billing behaves for shop owners.
