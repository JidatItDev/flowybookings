# Week 2 — billing host + cron URL cutover

Billing checkout / cancel / downgrade / Mollie webhook stay on the **app**.
Email drain stays on Edge (`process-email-queue`). Billing pg_cron uses vault **`app_url`**.

## Before applying `20260820130000_billing_crons_app_url.sql`

1. Deploy Week 2 app routes to the host Mollie and crons will call
   (`/hooks/billing-expiry`, `/hooks/billing-reconcile`, `/hooks/mollie-refresh-tokens`,
   `/api/mollie/webhook`, `/api/billing/*`).
2. In Supabase Vault, create/update secret **`app_url`**:
   - Public HTTPS origin only (no trailing slash)
   - Same value as app `APP_URL` / `VITE_APP_URL` for that host
   - Example: `https://www.flowybookings.com` (or current Lovable URL until DNS cutover)
3. Prefer vault **`cron_secret`** = app env `CRON_SECRET`. Fallback is still
   `email_queue_service_role_key`.
4. Apply migration `supabase/migrations/20260820130000_billing_crons_app_url.sql`
   yourself (do not rely on the agent to run it).

Verify jobs:

```sql
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname IN (
  'mollie-connect-refresh-tokens',
  'billing-reconcile',
  'billing-expiry'
);
```

Commands should contain your `app_url` host, not a stale hardcoded path alone.

## Mollie + env on that host

- `APP_URL` + `VITE_APP_URL` = vault `app_url`
- `MOLLIE_MODE` + mode-specific API key
- Platform webhook: `{APP_URL}/api/mollie/webhook`
- Connect callback (if used): `{APP_URL}/api/mollie-connect/callback`
- `CRON_SECRET` aligned with vault `cron_secret`

## Lovable → Render later

Update vault `app_url`, app env, Mollie webhook/redirect URLs. **No new cron SQL**
required if this migration is already applied.

## Smoke checklist

- [ ] Starter/Pro checkout → paid row + shop Active
- [ ] Return sync / webhook applies plan
- [ ] `email_send_log` reaches `sent` (Edge drain)
- [ ] `POST /hooks/billing-expiry` with `Authorization: Bearer $CRON_SECRET` → 200
- [ ] Admin Billing → Run expire sweep (super-admin only) → toast with expired/pending counts
- [ ] Cancel / schedule downgrade still work
