# Engineering Handoff — Platform Billing (Shop → Mollie)

Last updated: 2026-08-24, end of session. Branch: `feature/platform-billing` (9 commits ahead of `origin/feature/platform-billing`, not pushed).

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

**Not yet fixed — this is tomorrow's stated starting point:**

**Access-control gap: lapsed paid plans get free, indefinite Starter-tier access.** Found via design discussion, verified by reading the actual SQL, not yet fixed or tested.
- `shop_can_accept_bookings()` (DB function, in `supabase/migrations/20260821190000_billing_mollie_columns.sql`) only blocks bookings for expired trial and `payment_failed` past its 7-day grace. It has **no branch for `subscription_status = 'none'`** — falls through to `RETURN true`. Any shop whose paid plan lapses (swept by `billing-expiry.ts` to `plan: starter, subscription_status: none`) can keep creating bookings forever, free.
- `get_shop_feature_access()` (DB function, latest def in `supabase/migrations/20260814114220_entity_guards_dedup_staff_limit.sql`) determines feature access (SMS, staff limits, analytics — everything in `plan_features`) purely from `shops.plan`, **never** checks `subscription_status`. Same leak, broader scope.
- Root cause: `shops.plan` enum (`trial | starter | pro | premium` — exactly 4 Postgres enum values, confirmed via `CREATE TYPE public.subscription_plan` in `supabase/migrations/20260417182027_...sql`) has no "no active plan" value, so `billing-expiry.ts` reuses `starter` as the floor. That's fine *if* every consumer also checks `subscription_status` — but two important ones don't.
- Two design options were discussed, no decision made yet: (a) surgical fix — teach both SQL functions to treat `subscription_status = 'none'` as blocked, probably with the same 7-day-grace treatment as `payment_failed` for consistency; (b) add a real 5th `subscription_plan` enum value for "no plan" (bigger: Postgres `ALTER TYPE ... ADD VALUE`, plus updating every `ALLOWED_PLANS`/`.in("plan", [...])` list and the TS `DbPlan` type). Recommendation given was (a), but user said "will decide tomorrow" — **do not implement either without confirming which one first.**

**Minor, not urgent:**
- `mollie-webhook.ts`'s `handleSubscriptionLifecycle` "failed" branch (recurring payment failure) enqueues the `platform-payment-failed` email but only logs on **error**, never on success — asymmetric with the "paid" branch which logs `email_subscription_payment_received`. Confirmed via manual test that the email *does* send correctly; this is purely an observability gap (a `log.info` line missing), not a functional bug.
- Cycle-switch UX gap (monthly ↔ yearly on the same tier): `isCurrent` (even after this session's fix) doesn't compare `plan_billing_cycle`, so a monthly Starter customer toggling to "Yearly" still sees their tile disabled with no way to switch. Discussed at length (see git/chat history for full reasoning) — recommendation: monthly→yearly should behave like an upgrade (immediate, full price, reuses `ensureSinglePlatformSubscription`'s existing interval-patching), yearly→monthly should behave like a downgrade (scheduled at period end, since they've prepaid). Not started, not scoped into code yet.
- `plan-override.ts:54` pre-existing TS error (excess-property check on a `.update()` call) — predates this session, never touched, still there.

## 6. Remaining Work

**Must do next:**
1. Decide the enum/access-control fix (§5) and implement it — this is explicitly what the user wants to start with tomorrow.
2. Commit the 6 currently-uncommitted files (§2) — user reviews/commits himself, don't do this unprompted, but flag it since it's real working code sitting uncommitted.

**Should do later:**
3. Finish the manual QA matrix: F1 (failed upgrade), F2 (cancelled upgrade checkout), D1/D2 (downgrade then cancel), Y1 (yearly cycle), G1 (owner direct-write blocked by DB trigger — already covered by a migration-level trigger, just needs a manual click-through), G2 (already confirmed: `plan-confirm.ts` returns 410, mock billing fully removed).
4. Add the missing `log.info` on the recurring-payment-failed email success path (trivial, ~1 line).
5. Scope and build the cycle-switch (monthly↔yearly) feature discussed in §5.

**Optional:**
6. Verify the physical `.dev.vars` file (still on disk, gitignored, unread by the app now) doesn't hold anything unique not already in `.env`, then delete it.
7. Consider whether `MOLLIE_WEBHOOK_SECRET` should finally be set (flagged in the original audit as unset everywhere, low-priority hardening).

## 7. Exact Next Step

**Decide and implement the `subscription_status = 'none'` access-control fix.**

1. Re-read `shop_can_accept_bookings()`'s current body — it's in `supabase/migrations/20260821190000_billing_mollie_columns.sql` (the latest redefinition; there are two earlier ones too, in `20260419120000...` and `20260819120000_week2_billing_foundation.sql` — always check `\df+ shop_can_accept_bookings` or the migrations in date order to confirm which is actually live).
2. Ask the user to confirm option (a) surgical-SQL-fix vs (b) new-enum-value before writing anything — this was explicitly left as "decide tomorrow."
3. If (a): write a new migration adding a `subscription_status = 'none'` branch to both `shop_can_accept_bookings()` and `get_shop_feature_access()`. Decide grace period (7 days matching `payment_failed`, or immediate block) — ask, don't assume.
4. Test it against the live test shop (`e643c118-e74c-41fc-a6b3-32fc6707a881`, currently sitting at exactly `plan: starter, subscription_status: none` — the perfect existing repro case) by attempting to create a booking for it and confirming it's now blocked.
5. No TS/unit test exists for this DB-level logic today — consider whether a `tests/integration/` test against a real/faked Postgres function call is warranted, or whether manual verification (step 4) is sufficient given this is SQL, not application code.

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
- Don't implement the enum/access-control fix without confirming which option (§5, §7) — this was explicitly deferred to "decide tomorrow."
- Don't touch `plan-override.ts:54`'s pre-existing type error as part of unrelated work — it's known, pre-existing, and out of scope unless the user asks for it specifically.
- Don't commit the 6 uncommitted files without being asked — user reviews and commits himself (established preference this session).
- Don't add proration logic when eventually building the cycle-switch feature (§6) — explicitly decided against, to stay consistent with how upgrades already work.
- Don't re-derive the "how does Mollie recurring test payments work" research from scratch — it's documented in §8, already verified against Mollie's real docs this session (WebSearch/WebFetch citations are in chat history if deeper verification is ever needed).

## 10. Continuation Instructions

Start by reading this file, then run `git status` and `npm test` to confirm the repo matches §3 exactly (nothing should have changed since last night unless the user did something outside this tool). Then ask the user which access-control fix option they've decided on (§5/§7) before writing any code — that decision was explicitly left open.
