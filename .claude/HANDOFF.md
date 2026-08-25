# Engineering Handoff — Platform Billing (Shop → Mollie)

Last updated: 2026-08-25 (mid-session addendum — see §5/§7). Branch: `feature/platform-billing` (10 commits ahead of `origin/feature/platform-billing`, not pushed).

## 1. Project Context

FlowyBookings — a booking SaaS. This branch covers **platform subscription billing**: FlowyBookings charging shop owners for Starter/Pro/Premium plans via Mollie (FlowyBookings' own Mollie account — separate from Mollie Connect, which is unrelated per-shop payout OAuth for booking deposits, out of scope here).

No dedicated `subscriptions` table. Billing state lives on `shops` columns (`plan`, `plan_expires_at`, `plan_billing_cycle`, `subscription_status`, `pending_plan`, `mollie_customer_id`, `mollie_subscription_id`, `payment_failed_at`, `next_billing_at`) plus rows in the generic `payments` table (`provider = 'platform_mollie'`, `booking_id IS NULL`).

Stack: TanStack Start (React + server routes), Supabase (Postgres + pg_cron + Vault), Mollie API, Vitest. Deploying to **Render** (Cloudflare Worker config was removed this session — see §4).

Session arc: (1) full architecture audit, (2) unit-tested every pure/extractable billing function, (3) found & fixed a live-pricing bug (admin-set prices weren't reaching Mollie), (4) manual E2E QA via ngrok + Mollie test mode, guided live, (5) found and fixed 2 more real bugs from that QA, (6) opened a real access-control gap via design discussion (not yet fixed).

## 2. Work Completed In This Session

**Committed** (commits `ab8b907`, `1e36063`, `9aabbe6`, plus earlier commits this branch already had):
- Unit tests for every pure/extractable billing function (~230 tests across 14-15 files). Extracted pure decision logic out of I/O-heavy handlers, mirroring the existing `cancel-outcome.ts` pattern: `subscription-attempt.ts`, `expiry-sweep-decision.ts`, `plan-downgrade-decision.ts`, `plan-checkout-decision.ts`, `sms-credits-decision.ts`, `server/cron-auth.ts` (deduped identical `cronAuthorized` logic that was copy-pasted in `billing-expiry.ts`/`billing-reconcile.ts`).
- **Live pricing fix**: `admin/settings/platform-billing.ts` gained `resolvePlanPriceCents()` (pure) and `priceFor()` became a thin wrapper over it. New server-only `shop/billing/server/plan-price.ts` (`fetchPlanPriceCents`) reads `plan_pricing.monthly_price_cents` live, falls back to the hardcoded map only if the DB row is missing/errors. Wired into `plan-checkout.ts`, `plan-downgrade.ts`, and — highest stakes — `mollie-webhook.ts`, which previously had its **own separate hardcoded price map** (`subscriptionAmountCents`, now deleted) controlling the actual recurring Mollie subscription amount. Before this fix, admin price changes never reached real Mollie charges.
- Removed all Cloudflare Worker config: deleted `wrangler.jsonc`, removed `@cloudflare/vite-plugin` dependency (verified `npm run build` still works — it's an optional peer dep of `@lovable.dev/vite-tanstack-config`).
- Collapsed `.dev.vars`/`.env.local`/`.env` three-file local-env setup down to **`.env` only** (`src/server/env.ts` simplified). `.dev.vars.example` deleted. The physical `.dev.vars` file was **left on disk untouched** (gitignored, not read anymore) — not verified against `.env` for unique values.
- `git rm --cached .env` — `.env` is untracked going forward (history not rewritten; team decided that's acceptable for now, see §4).

**Uncommitted** (working tree right now — `git status` confirms exactly these 7 files, `npm test` passes 235/235):
- `src/shop/billing/use-plan-pricing.ts` + new `src/shop/billing/__tests__/use-plan-pricing.test.ts` (16 tests) — fixed `formatPlanPrice()` silently rounding fractional prices to whole euros (`maximumFractionDigits: 0` → matched `format.ts`'s correct `minimumFractionDigits: amount % 1 === 0 ? 0 : 2` pattern). Found via manual QA using a €1.23 test price.
- `src/shop/billing/UpgradePage.tsx` — `isCurrent` now also requires `subscription_status === "active"`, not just plan-name match. Previously a cancelled/expired shop's own plan tile was permanently disabled — no way to resubscribe to the same plan via UI.
- `src/shop/billing/ShopBillingCard.tsx` — `canCancel` now also excludes `subscription_status === "none"` (previously only excluded `"cancelled"`), so "Cancel subscription" no longer shows when there's nothing to cancel.
- `src/shop/billing/server/plan-cancel.ts` + `cancel-outcome.ts` + `cancel-outcome.test.ts` — server-side hardening to match: new `resolveCancelPreflight()` pure function (already_cancelled / no_subscription / proceed), guards the `/api/billing/plan-cancel` endpoint itself against being hit while `subscription_status === "none"`, not just the UI. 5 new tests.

No migrations were written this session. No new API routes.

## 3. Current State

- `npm run test:unit` / `npm test`: **235/235 passing**, verified moments ago.
- `npx tsc --noEmit`: clean except **one pre-existing, unrelated** error in `src/admin/billing/server/plan-override.ts:54` (excess-property-check issue on a Supabase `.update()` call) — confirmed via `git stash` to predate this session, not touched.
- `npx eslint`: clean on everything touched this session (2 pre-existing warnings in `ShopBillingCard.tsx` unrelated to our edits, verified via stash).
- `npm run build`: succeeds, produces plain `dist/server/server.js` (no Cloudflare-specific output).

**Manually tested live** (ngrok + Mollie test mode, real DB, on shop `e643c118-e74c-41fc-a6b3-32fc6707a881` / Mollie customer `cst_4iWfJQPpyh`), all passing:
- **P0** (new, ad hoc): admin-set price (€1.23) flows correctly into checkout amount, the real Mollie subscription object's amount, and payment history.
- **H1**: trial → Starter monthly, paid.
- **R1**: recurring renewal, paid — created via a manual `sequenceType: recurring` Payments API call + Mollie's test-mode `changePaymentState` page (real subscription intervals can't go below 1 day, so this is the documented way to test renewals without waiting). Full DB state verified correct.
- **R2**: recurring renewal, failed — same technique, `subscription_status` correctly flips to `payment_failed` with grace period, plan/expiry untouched. Confirmed the failure email actually sends (found in the process: no success log line for this email path — see §5).
- **C1**: cancel — Mollie subscription cancelled, DB fields cleared correctly, access-until-date UI correct. This is where the `isCurrent`/`canCancel` bugs were found (via the "Reactivate" button leading nowhere useful).
- **X1**: expiry sweep (`/hooks/billing-expiry`) — confirmed lapsed plans **always** land on `plan: starter, subscription_status: none`, **never** trial. This is where the access-control gap in §5 was found.

**Test shop's current live DB state** (as of session end): `plan: starter`, `subscription_status: none`, `plan_expires_at: null`, `next_billing_at: null`, `mollie_subscription_id: null`, `mollie_customer_id: cst_4iWfJQPpyh` (unchanged). Untested from the original matrix: F1, F2, D1/D2, Y1, G1, G2. See `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md` for the full matrix (only P0/H1/R1/R2/C1/X1 rows have real results now).

## 4. Important Decisions — do not silently reverse

- **Cloudflare Worker support was deliberately removed**, not just neglected. User confirmed Render is the sole target. Do not re-add `wrangler.jsonc` or `@cloudflare/vite-plugin` without asking first.
- **`.dev.vars`/`.env.local` support was deliberately removed** from `server/env.ts` — `.env` is now the only local env file read. This was a explicit simplification request ("on Render we'd only insert `.env`"), not an oversight.
- **`.env` git history was NOT rewritten.** User explicitly chose `git rm --cached .env` (stop tracking going forward) over the full `git filter-repo` + force-push history-scrub I originally proposed, after being told plainly that old commits still contain whatever was in `.env` historically. This was an informed tradeoff for simplicity, not a security oversight to "fix" — don't do the history rewrite unprompted.
- **No proration exists anywhere in this app, by design** (upgrades charge full new price immediately, no credit for unused time). This is relevant context if implementing the cycle-switch feature (see §6) — the recommendation on the table is to follow the same no-proration philosophy, not invent one.
- **`priceFor()` (hardcoded, client-safe, no DB) was kept**, not deleted, specifically for client-side estimates before `plan_pricing` loads. `fetchPlanPriceCents()` (server-only, DB-backed) is the one that must be used for anything that actually charges money.

## 5. Known Issues / Bugs

**Access-control gap: FIXED IN CODE 2026-08-25, migration NOT YET APPLIED to Supabase (user will run it).**
- Decision made: surgical fix (option a from below), hard block with **no grace period** (unlike `payment_failed`'s 7 days) — the whole point of `subscription_status = 'none'` is that the grace period (or the paid-until date after cancellation) already ran out.
- New migration: `supabase/migrations/20260825120000_lapsed_subscription_block.sql` — adds a `subscription_status = 'none'` branch to both `shop_can_accept_bookings()` and `get_shop_feature_access()`, returning blocked/not-allowed. **Not applied to the live Supabase project yet** — user is running it themselves. Until it's applied, the underlying DB-level leak described below is still live in production.
- Client-side mirror: `src/shared/lib/trial.ts` gained `TrialState.isLapsed` (`!isTrial && subscriptionStatus === "none"`), and `canAcceptBookings` now returns `false` for it. Two new tests in `trial.test.ts` (237/237 passing total).
- UI: `TrialBanner.tsx` gained a new blocking-banner case (priority 1.5, same red/Ban styling as `payment_failed`-grace-expired) using new i18n keys `billing.lapsedBlockedTitle`/`Sub` (en + nl).
- `ShopLayout.tsx`'s `ShopLayoutInner` redirects to `/shop/upgrade` whenever there's no live subscription behind the shop — `accessBlocked = trialState.isLapsed || (trialState.isTrial && trialState.isExpired)` — covering **both** a lapsed paid plan and a trial whose 14 days ran out with no plan picked (added on request, for parity: previously only the paid-lapsed case redirected, expired trial was banner-only). Exempts `/shop/upgrade`, `/shop/billing`, `/support`, and bypasses entirely for `isSuperAdmin` (impersonation/support still works).
- Also deleted two dead, factually-wrong i18n keys (`billing.cancelledTitle`/`billing.cancelledSub`, en + nl) that claimed a lapsed shop "moves back to the free trial" — confirmed zero references anywhere in the codebase, and the real behavior (`billing-expiry.ts`) has never done that; it always lands on `plan: starter, subscription_status: none`.
- **Original bug** (for context, now fixed above): `shop_can_accept_bookings()` had no branch for `subscription_status = 'none'`, falling through to `RETURN true`; `get_shop_feature_access()` keyed purely off `shops.plan`, never checking `subscription_status`. Root cause: `shops.plan` enum (`trial | starter | pro | premium`, exactly 4 Postgres values) has no "no active plan" value, so `billing-expiry.ts` reuses `starter` as the floor — fine only if every consumer also checks `subscription_status`, which two important ones didn't.
- Plan doc: `docs/superpowers/plans/2026-08-25-lapsed-subscription-access-block.md` — full task-by-task detail and the manual-verification checklist (Task 5), not yet run since the migration isn't applied yet.

**Follow-up UX pass (same day, after the user tried the live UI):** the billing card read "Current plan: Starter" right next to "No active subscription yet" — contradictory once a plan can actually lapse. Fixed:
- `ShopBillingCard.tsx`: shows "Previous plan" instead of "Current plan" when lapsed, and the pill reads "No active subscription — resubscribe to continue" instead of the new-shop-only "...yet" wording.
- New `src/shop/billing/use-last-paid-plan.ts`: **`shops.plan` cannot tell you what the shop's real last plan was** — `billing-expiry.ts` always flattens it to `"starter"` on expiry regardless of whether the shop was on Pro or Premium. This hook reads the last **paid** row in `payments.metadata.plan` instead, which survives that flattening. Both `ShopBillingCard.tsx` and `UpgradePage.tsx` use it to show the true previous tier.
- `UpgradePage.tsx`: top summary strip shows "Your previous plan: {tier}" + an "Inactive" pill when lapsed; the matching plan tile gets a "Previous plan" badge and a "Resubscribe to {plan} →" button instead of the generic upgrade CTA.
- New i18n keys: `shopBilling.previousPlan`, `shopBilling.lapsedNoSubscription`, `upgrade.wasOn`, `upgrade.inactive`, `upgrade.previousPlanBadge`, `upgrade.cta.resubscribe` (en + nl).

**Second follow-up (same day): sidebar/menu nav did nothing when blocked.** With the redirect in place, `/shop/upgrade` itself is exempt (so it renders), but its sidebar still listed Calendar/Staff/etc. as normal `<Link>`s — clicking one navigated to a blocked route, which `accessBlocked` immediately bounced back from, so from the user's perspective the click "did nothing." Fixed in `ShopLayout.tsx`:
- New `isNavItemLocked(to)` — true whenever `subscriptionRequired` (no live subscription, not a super admin) and `to` isn't one of the allowed paths. Applied to every item in both the desktop sidebar `<nav>` and the mobile sheet nav: a locked item renders with a `Lock` icon, muted styling, a `title` tooltip (`shopNav.lockedTooltip`), and links straight to `/shop/upgrade` instead of its real destination.
- Same fix applied to `AccountMenu`'s dropdown/mobile-sheet items (Dashboard, Settings) — `isLocked` is passed down from `ShopLayoutInner` as a prop; Subscription/Support stay unlocked since they're already on the allowed list.
- New i18n key: `shopNav.lockedTooltip` (en + nl).

**Remaining before this can be marked fully done:**
- Apply `20260825120000_lapsed_subscription_block.sql` to the Supabase project (user doing this).
- Run the manual verification in the plan doc's Task 5 against the live repro shop (`e643c118-e74c-41fc-a6b3-32fc6707a881`, sitting at exactly `plan: starter, subscription_status: none`): confirm `shop_can_accept_bookings()` now returns `false`, confirm the dashboard redirect and banner render correctly, confirm the public booking link is rejected, confirm super-admin impersonation is NOT blocked.
- Also manually verify the expired-trial redirect (new, added same day for parity — no migration involved, this is pure client-side and already live once deployed): create/use a trial shop with `plan_expires_at` in the past, confirm it also redirects to `/shop/upgrade` and shows the existing "trial expired" banner (this path doesn't touch the DB functions at all, only `ShopLayout.tsx`'s `accessBlocked`).
- Verify the "previous plan" UI: a lapsed shop whose last **paid** payment was for `pro` or `premium` (not `starter`) should show that real tier as "Previous plan" on both `ShopBillingCard` and the matching `UpgradePage` tile, not "Starter" (which is what `shops.plan` alone would incorrectly suggest post-sweep).
- Update this file's own "remaining work" list and the QA matrix doc's Results log once that manual pass is done (see §6 below — left as-is until verified for real, not just marked done from code alone).

**Minor, not urgent:**
- `mollie-webhook.ts`'s `handleSubscriptionLifecycle` "failed" branch (recurring payment failure) enqueues the `platform-payment-failed` email but only logs on **error**, never on success — asymmetric with the "paid" branch which logs `email_subscription_payment_received`. Confirmed via manual test that the email *does* send correctly; this is purely an observability gap (a `log.info` line missing), not a functional bug.
- Cycle-switch UX gap (monthly ↔ yearly on the same tier): `isCurrent` (even after this session's fix) doesn't compare `plan_billing_cycle`, so a monthly Starter customer toggling to "Yearly" still sees their tile disabled with no way to switch. Discussed at length (see git/chat history for full reasoning) — recommendation: monthly→yearly should behave like an upgrade (immediate, full price, reuses `ensureSinglePlatformSubscription`'s existing interval-patching), yearly→monthly should behave like a downgrade (scheduled at period end, since they've prepaid). Not started, not scoped into code yet.
- `plan-override.ts:54` pre-existing TS error (excess-property check on a `.update()` call) — predates this session, never touched, still there.

## 6. Remaining Work

**Must do next:**
1. Apply the `20260825120000_lapsed_subscription_block.sql` migration (user running it) and run the manual verification in §5 / the plan doc's Task 5.
2. Commit the access-control fix's files (`supabase/migrations/20260825120000_lapsed_subscription_block.sql`, `src/shared/lib/trial.ts` + test, `src/shop/shell/TrialBanner.tsx`, `src/shop/shell/ShopLayout.tsx`, both translation files) — user reviews/commits himself, don't do this unprompted.

**Should do later:**
3. Finish the manual QA matrix: F1 (failed upgrade), F2 (cancelled upgrade checkout), D1/D2 (downgrade then cancel), Y1 (yearly cycle), G1 (owner direct-write blocked by DB trigger — already covered by a migration-level trigger, just needs a manual click-through), G2 (already confirmed: `plan-confirm.ts` returns 410, mock billing fully removed).
4. Add the missing `log.info` on the recurring-payment-failed email success path (trivial, ~1 line).
5. Scope and build the cycle-switch (monthly↔yearly) feature discussed in §5.

**Optional:**
6. Verify the physical `.dev.vars` file (still on disk, gitignored, unread by the app now) doesn't hold anything unique not already in `.env`, then delete it.
7. Consider whether `MOLLIE_WEBHOOK_SECRET` should finally be set (flagged in the original audit as unset everywhere, low-priority hardening).

## 7. Exact Next Step

**Apply the lapsed-subscription migration and run the manual verification.**

1. Apply `supabase/migrations/20260825120000_lapsed_subscription_block.sql` to the Supabase project (user's own step — not done yet as of this write-up).
2. Run Task 5 of `docs/superpowers/plans/2026-08-25-lapsed-subscription-access-block.md`: verify `shop_can_accept_bookings('e643c118-e74c-41fc-a6b3-32fc6707a881')` now returns `false`, verify `get_shop_feature_access(...)` returns `allowed: false`, verify the dashboard redirect + banner in the browser, verify the public booking link is rejected, verify super-admin impersonation is NOT blocked.
3. Once verified, update this file's §5/§6 "remaining before done" bullets and the QA matrix doc's Results log per the plan's Task 5 Steps 4-5.
4. After that: pick up the other items already queued in §6 "Should do later" (finish the F1/F2/D1/D2/Y1/G1 QA matrix rows, the missing `log.info` on the recurring-payment-failed success path, the cycle-switch feature).

## 8. Important Technical Details

- **Test commands**: `npm run test:unit` (src only, fast), `npm test` (unit + integration, same right now since no integration tests exist), `npx tsc --noEmit -p tsconfig.json`, `npx eslint <paths>`.
- **Local dev**: `npm run dev` (port 8080, falls back to 8081 if taken — don't start a second instance without a reason, it happened once this session for diagnostic purposes and was cleaned up after).
- **ngrok**: the tunnel used this session was `https://785d-2407-d000-17-4278-c70-7548-c1bb-4048.ngrok-free.app` — this is ephemeral, likely already dead by tomorrow. `.env`'s `APP_URL`/`VITE_APP_URL` must be updated to whatever new tunnel URL is running before any Mollie webhook round-trip will work again.
- **Testing Mollie recurring payments**: no interval shorter than "1 day" exists (verified against Mollie's own docs this session, corrected an earlier wrong assumption about a "5 minute" test interval). The real technique: create a payment directly via `POST https://api.mollie.com/v2/payments` with `sequenceType: "recurring"`, `customerId`, and matching `metadata` (`shop_id`, `kind: "subscription_recurring"`, `plan`, `cycle`) — the response has no `checkout` link but has `_links.changePaymentState.href`, a hosted page to manually force Paid/Failed. **Watch for `&` in copy-pasted JSON** — that's JSON's escaped `&`; paste it into a browser literally and you'll get a 404. Full worked examples are in this session's chat history if needed again.
- **Cron auth locally**: crons don't fire locally (they only run against Supabase's `vault.app_url`, which points at production/staging, never localhost/ngrok). To test `/hooks/billing-expiry` or `/hooks/billing-reconcile` locally, `curl -X POST http://localhost:8080/hooks/... -H "Authorization: Bearer $CRON_SECRET"` manually.
- **Secrets**: `.env` holds `MOLLIE_MODE=test`, `MOLLIE_API_KEY_TEST`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, etc. — never read/echoed by Claude this session per the user's environment's own permission rules; commands referencing them should use `$VAR_NAME` shell expansion, run by the user or via Bash without the raw value ever appearing in a tool result.
- **`plan_pricing` table**: admin-editable via `/admin` → Plan Configuration card, publicly readable, RLS-gated writes to `super_admin` only. `monthly_price_cents` is the field that now actually matters for real charges (see §2).

## 9. Things NOT To Do

- Don't re-add Cloudflare/wrangler config (§4).
- Don't rewrite `.env` git history or suggest it again unprompted (§4) — already discussed and explicitly declined in favor of the simpler `git rm --cached`.
- Don't apply the `20260825120000_lapsed_subscription_block.sql` migration yourself — user explicitly said he'd run it himself.
- Don't touch `plan-override.ts:54`'s pre-existing type error as part of unrelated work — it's known, pre-existing, and out of scope unless the user asks for it specifically.
- Don't commit files without being asked — user reviews and commits himself (established preference, reconfirmed this session).
- Don't add proration logic when eventually building the cycle-switch feature (§6) — explicitly decided against, to stay consistent with how upgrades already work.
- Don't re-derive the "how does Mollie recurring test payments work" research from scratch — it's documented in §8, already verified against Mollie's real docs this session (WebSearch/WebFetch citations are in chat history if deeper verification is ever needed).

## 10. Continuation Instructions

Start by reading this file, then run `git status` and `npm test` to confirm the repo state. As of 2026-08-25: the lapsed-subscription access-control fix is written and tested (237/237 passing) but the migration has not been applied to Supabase yet — check whether the user has run it since, then pick up at §7's manual-verification step.
