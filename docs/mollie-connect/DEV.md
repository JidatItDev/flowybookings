# Mollie Connect — developer notes

Covers the per-shop OAuth integration that lets a shop accept booking-deposit payments into **their own** Mollie account, with FlowyBookings taking a fixed per-booking application fee. This is separate from **platform billing** (FlowyBookings' own Mollie account, used to charge shops for their SaaS subscription) — see `docs/billing/DEV.md` for that; it's out of scope for everything below.

Lifecycle (connect/confirm/refresh/disconnect) was audited, hardened, and live-tested end-to-end on 2026-08-25 on branch `feature/platform-billing`. Booking-side usage (checkout/refund/webhook) predates this pass and was **not** re-verified live this round — see "Known gaps" below.

## Data model

`shop_payment_providers` (one row per shop+provider, `UNIQUE(shop_id, provider)`, RLS: owner or super_admin only):

| Column | Meaning |
|---|---|
| `connection_status` | `not_connected \| pending \| connected \| disconnected \| error` |
| `onboarding_status` | `not_started \| in_review \| completed \| rejected` |
| `provider_account_id` | Mollie organization id (`org_...`) |
| `application_fee_enabled` | Owner-visible toggle for whether the booking fee applies |
| `application_fee_percent` | **Dead column** — legacy percent-based fee model, superseded by the fixed-cents-per-plan model (`resolveApplicationFeeCents`/`bookingFeeCentsForPlan`); still displayed in the admin `ProvidersPage` list, no longer used in any real fee math |
| `metadata` (jsonb) | `access_token_enc`, `refresh_token_enc` (encrypted, see below), `token_expires_at`, `organization_id`/`_name`, `profile_id`, `scopes`, `connection_confirmed`, `last_refresh_at`, `last_refresh_error`, `oauth_state`* (transient, cleared once consumed) |

`payments` rows for Connect payments use `provider = 'mollie_connect'`, with `provider_payment_id` (Mollie's `tr_...`), `application_fee_cents`, and refund metadata (`refund_id`, `refunded_by`, etc.) — separate from platform billing's `provider = 'platform_mollie'` rows in the same table.

## Token encryption

Access/refresh tokens are encrypted at rest — never stored in plaintext. Mechanism:
- A symmetric AES key lives in **Supabase Vault** (`vault.secrets`, name `mollie_token_key`), generated once by migration `20260419204751_...sql`. Not derived from any Mollie credential — generated locally, Mollie never sees it.
- Two Postgres functions, `encrypt_mollie_token(plaintext)` / `decrypt_mollie_token(ciphertext)` — `SECURITY DEFINER`, `REVOKE`d from `anon`/`authenticated`, `GRANT`ed only to `service_role`. AES-CBC with a random IV per call, output `base64(iv || ciphertext)`.
- App-side wrappers: `encryptToken`/`decryptToken` in `mollie-connect.ts`, thin RPC calls into those two functions.

**Known gap fixed 2026-08-25**: Supabase-managed projects install `pgcrypto` into the `extensions` schema, not `public` — the original functions' `SET search_path = public` couldn't resolve `gen_random_bytes`/`encrypt_iv`/`decrypt_iv`, surfacing as `function gen_random_bytes(integer) does not exist` on the very first real encryption attempt. Fixed by `20260825150000_mollie_token_pgcrypto_search_path.sql` (widens search_path to `public, extensions`, idempotent). **This — and the original `mollie_token_key` vault secret — must be confirmed present in every environment before Connect is enabled there**; both were found missing in this session's dev/test Supabase project despite the original migration existing in the repo, so there's no reason to assume production is different without checking.

## OAuth flow

1. **`connect-authorize.ts`** (`GET /api/mollie-connect/authorize?shop_id=`) — verifies caller is the shop owner or a super_admin (`resolveShopAccessDecision`), generates a one-time `state` UUID, upserts a `pending` row with `state` stashed in `metadata`, returns Mollie's authorize URL (scopes: `organizations.read profiles.read payments.read payments.write refunds.read refunds.write onboarding.read`).
2. Browser redirects to Mollie; shop owner logs into **their own** Mollie account (must be org owner — Mollie blocks OAuth authorization for non-owner team members) and approves.
3. **`connect-callback.ts`** (`GET /api/mollie-connect/callback`, unauthenticated — security is the one-time `state` match) — exchanges `code` for tokens, fetches org name + first profile id (best-effort, non-fatal if these fail), encrypts both tokens, writes `connection_status: connected`, `connection_confirmed: false`. Wrapped in try/catch (added 2026-08-25 after a live failure surfaced a raw 500 instead of a graceful redirect) — any failure past token exchange flips the row to `connection_status: error` with `oauth_error` recorded and redirects with `?mollie_connect=error&reason=connect_failed`.
4. **`MollieConnectCard.tsx`** shows a confirmation screen ("is this the right business?") before treating the connection as fully trusted — `connection_confirmed` flips to `true` via a direct client-side RLS-permitted update (no extra endpoint needed).
5. **`connect-disconnect.ts`** clears both encrypted tokens and flips to `disconnected`. Deliberately does **not** call Mollie's revoke endpoint (preserves refund history for already-made payments); the merchant can revoke from their own Mollie dashboard if they want to fully remove access.

## Token refresh

Two call sites, two different policies for a **missing/unparseable expiry** — see `mollie-token-decision.ts`:

| | Function | On missing expiry | Why |
|---|---|---|---|
| On-demand (before any Mollie API call) | `accessTokenNeedsRefresh` | Assume still valid | Avoids refreshing on every single request for rows that predate this field |
| Cron (background, every 4h) | `cronRowIsDueForRefresh` | Assume due | Cheap in a background job; the only path that ever fixes a row stuck without a known expiry |

`getActiveMollieAccessToken()` (`mollie-connect.ts`) is the on-demand path — used by `checkout.ts`, `refund.ts`, `connect-webhook.ts` before any Mollie call. `mollie-refresh-tokens.ts` (`/hooks/mollie-refresh-tokens`, cron `mollie-connect-refresh-tokens`, `0 */4 * * *`) is the bulk path — uses `cronAuthorized()` from `@/server/cron-auth` (shared with `billing-expiry`/`billing-reconcile`, prefers vault `cron_secret`, falls back to service-role/anon/publishable key) and `planTokenRefresh()` to categorize every connected row as `refresh` / `skip_no_refresh_token` / `skip_not_due` before doing any I/O.

## Core files

| File | Role |
|---|---|
| `src/shop/payments/mollie-connect.ts` | Constants, encryption wrappers, `refreshMollieTokens`, `getActiveMollieAccessToken` |
| `src/shop/payments/server/connect-authorize.ts` | OAuth step 1 |
| `src/shop/payments/server/connect-callback.ts` | OAuth step 2 |
| `src/shop/payments/server/connect-disconnect.ts` | Disconnect |
| `src/shop/payments/server/mollie-refresh-tokens.ts` | Cron: bulk token refresh |
| `src/shop/payments/server/connect-webhook.ts` | Incoming Mollie payment webhook → updates `payments`/`bookings` (booking-side, not re-verified this round) |
| `src/booking/server/checkout.ts` | Creates the Mollie payment for a booking deposit (booking-side, not re-verified this round) |
| `src/booking/server/refund.ts` | Owner-initiated refund (booking-side, not re-verified this round) |
| `src/shop/payments/server/shop-access-decision.ts` | Pure: owner-or-super_admin decision (shared by authorize/disconnect) |
| `src/shop/payments/server/connect-callback-decision.ts` | Pure: state matching, connected/error metadata shape, redirect URL builder |
| `src/shop/payments/server/mollie-token-decision.ts` | Pure: refresh-due windowing (on-demand vs cron) |
| `src/shop/payments/MollieConnectCard.tsx` | Shop-facing connect/confirm/disconnect UI |
| `src/shop/payments/MollieConnectPayments.tsx` | Shop-facing incoming-payments list + refund action |
| `src/admin/providers/ProvidersPage.tsx` | Admin overview across all shops, **includes a manual status override** (see Known gaps) |
| `src/admin/payments/admin-mollie-health.ts` / `MollieHealthPanel.tsx` | Admin health view: connection status, token expiry, last refresh/error, 30-day fees |

## Logging

Every server file uses the shared structured logger (`createLogger`, `@/server/logger` — same one billing uses), not raw `console.*`. Scopes: `mollie_connect`, `mollie_connect.authorize`, `.callback`, `.disconnect`, `.refresh_tokens`, `.webhook`. The logger's `sanitize()` step auto-redacts any field whose *key* matches `authorization|access_token|refresh_token|...secret|bearer` — a backstop, not the only precaution (token *values* are never logged regardless, only ids/lengths/presence/status).

## Testing

Unit tests (`src/shop/payments/server/__tests__/`) cover every pure/extractable decision function — `shop-access-decision.test.ts`, `connect-callback-decision.test.ts`, `mollie-token-decision.test.ts` (68 tests total added 2026-08-25). No integration-test scaffolding exists yet for this area (would need fake-Supabase/fake-Mollie support under `tests/support/` — see `tests/README.md`); route handlers stay thin wrappers around the pure logic instead.

**Manually verified live** 2026-08-25 (dev Mollie OAuth app + ngrok + dev Supabase project) — full connect → confirm → forced cron refresh → disconnect → reconnect lifecycle, all passing. See `tests/manual/mollie-connect.md` for the scenario table and exact results.

**Not yet manually verified**: booking-deposit checkout, refund, and the incoming payment webhook (`connect-webhook.ts`) — planned for the next phase of this feature.

## Known gaps / deliberately deferred

- **Admin manual status override** (`ProvidersPage.tsx`'s "mark connected" button) can set `connection_status: connected` on a row with **no real tokens** — `getActiveMollieAccessToken()` then silently returns `null`, and `checkout.ts` treats that as `skipped: true, reason: "no_mollie_connection"` rather than erroring loudly, so a shop can appear "Connected" in the UI while deposits are quietly never charged. Deferred to a future session per product decision — not fixed in this pass.
- `application_fee_percent` column is dead (see Data model above) — worth either wiring it to something real or removing it from the admin list display.
- `connect-webhook.ts` has no cryptographic webhook signature verification — mitigated by always re-fetching the payment from Mollie using the shop's own access token before trusting any status change, so a forged webhook can't fabricate a fake "paid" (worst case: a wasted API call). Same posture as the platform billing webhook.
- Production Supabase project's `mollie_token_key` vault secret and `pgcrypto` search_path have **not been confirmed** — see the Token encryption section above. Must check before enabling Connect for real shops.
- `.env.example` documents `MOLLIE_CONNECT_CLIENT_ID`/`_SECRET` distinctly from the unrelated `MOLLIE_CLIENT_ID`/`_SECRET` (platform-billing admin status card, effectively unused elsewhere) — easy to confuse when setting Render env vars.

## Related files

- `docs/mollie-connect/CLIENT.md` — plain-language summary for shop owners.
- `tests/manual/mollie-connect.md` — lifecycle scenario table + live results log.
- `.env.example` — Mollie Connect env var setup (dev vs prod OAuth apps).
- `supabase/migrations/20260418163042_...sql` — `shop_payment_providers` table.
- `supabase/migrations/20260419204751_...sql` — encryption functions + vault key + original cron schedule.
- `supabase/migrations/20260825150000_mollie_token_pgcrypto_search_path.sql` — pgcrypto search_path fix.
- `docs/billing/DEV.md` — platform billing (the other, separate Mollie integration).
