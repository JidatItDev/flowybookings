# Manual test plan: Mollie Connect (per-shop OAuth)

Scenarios that need a real Mollie OAuth round trip and can't be covered by
unit tests against fakes (see `src/shop/payments/server/__tests__/` for the
pure decision logic that *is* unit tested — state matching, token-refresh
windowing, connected-metadata shape, shop-access decisions).

Scope: the connect/confirm/refresh/disconnect lifecycle only. Booking-deposit
checkout (`checkout.ts`), refunds (`refund.ts`), and the incoming payment
webhook (`connect-webhook.ts`) are deliberately **not** covered here — that's
a separate pass once the booking-payment side of this feature is built out.

Requires: a Mollie OAuth app registered per environment (`MOLLIE_CONNECT_CLIENT_ID`/
`_SECRET` in `.env`, dev app's redirect URL pointed at your current ngrok
tunnel — see `.env.example`), and a Mollie account where you're the **owner**
(Mollie only allows org owners to authorize Connect apps, not just team
members with dashboard access).

Check off the date + result each time this is run, don't just tick the box once and forget it.

## Connect lifecycle

| # | Scenario | Steps | Expected | Last run |
|---|---|---|---|---|
| 1 | Fresh connect | On `/shop/payments`, click Connect → authorize on Mollie (as an org owner) → land back. | Redirect to `?mollie_connect=ok`. Org-confirmation screen shown with org name/id. `shop_payment_providers` row: `connection_status=pending→connected` after confirm, `access_token_enc`/`refresh_token_enc` both set (real base64 blob, not tiny), plaintext `access_token`/`refresh_token` both `null`, `connection_confirmed=true` after confirming. Logs: `mollie_connect.authorize state_issued` → `mollie_connect.callback token_exchanged` → `org_resolved` → `connected`. | 2026-08-25 — PASS (shop `ed671e6c-3de9-4e08-ab0b-892bf72fa1c7`, org `org_19603331` "TEST") |
| 2 | Non-owner Mollie account | Log into Mollie with an account that has dashboard access but isn't the org owner, then Authorize. | Mollie itself blocks it: "You are not the owner of the Mollie organization." — not our bug, a Mollie policy. Confirms the login screen isn't silently mis-scoped. | 2026-08-25 — confirmed (real Mollie policy, not app behavior) |
| 3 | Forced token refresh (cron) | Backdate `metadata.token_expires_at` to the past via SQL, then `POST /hooks/mollie-refresh-tokens` with `CRON_SECRET`. | `{ok:true, refreshed:1, skipped:0, failed:0}`. DB: `token_expires_at` moves to ~1h out, `last_refresh_at` stamped, `last_refresh_error=null`, `last_synced_at` updated. Logs: `cron_start total=1` → `refreshed shop_id=... new_expires_at=...` → `cron_done`. | 2026-08-25 — PASS |
| 4 | Disconnect | Click Disconnect on `/shop/payments`. | `connection_status=disconnected`, both `*_token_enc` cleared, `disconnected_at` stamped, `provider_account_id=null`. Log: `mollie_connect.disconnect disconnected`. | 2026-08-25 — PASS |
| 5 | Reconnect after disconnect | Immediately click Connect again and re-authorize. | Goes through the upsert's `onConflict` branch (row already exists) rather than a fresh insert — lands back on `connected` cleanly, no leftover `pending`/error state from the prior disconnect. Logs: `state_issued` → `token_exchanged` → `org_resolved` → `connected`. | 2026-08-25 — PASS |
| 6 | Abandoned authorize (no Mollie account) | Click Connect, then navigate away from Mollie's login screen without authorizing. | Row left in `connection_status=pending` with a stashed, never-consumed `oauth_state` — harmless. Clicking Connect again cleanly overwrites it (upsert), no stale-state cleanup needed. | 2026-08-25 — confirmed |
| 7 | Vault/pgcrypto misconfigured | (Regression check, not routine) — `mollie_token_key` missing from Vault, or `pgcrypto` installed outside the `public` schema. | Before the fix: raw 500, row stuck in `pending` with no error recorded. After the fix (`connect-callback.ts` try/catch + `20260825150000_mollie_token_pgcrypto_search_path.sql`): graceful `?mollie_connect=error&reason=connect_failed` redirect, row flips to `connection_status=error` with `oauth_error` recorded, logged via `mollie_connect.callback post_token_exchange_failure`. | 2026-08-25 — root-caused and fixed live during this session's testing |

## Not yet covered

- Booking-deposit checkout creating a real Mollie payment on the connected account (`checkout.ts`)
- The incoming payment webhook flipping a booking to confirmed/cancelled (`connect-webhook.ts`)
- Refunds (`refund.ts`)
- Production environment: this pass was entirely against the **dev** Mollie app / dev Supabase project. `20260825150000_mollie_token_pgcrypto_search_path.sql` and the original `mollie_token_key` vault secret still need to be confirmed (or applied) against the **production** Supabase project before Connect is enabled for real shops there — the same gaps found here are equally likely to exist in prod since it's the same migration history.
