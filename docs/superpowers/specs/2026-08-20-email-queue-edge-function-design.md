# Email Queue Worker → Supabase Edge Function (Design Spec)

**Status:** Approved (2026-08-20)  
**Scope:** Move transactional email queue draining from TanStack server route to a Supabase Edge Function. Shared cloud DB for local + production (no env isolation).

---

## Goal

One drain endpoint colocated with the database so `pg_cron` and the app (local or production) both call the same worker without depending on the Cloudflare/TanStack app URL.

---

## Decisions

| Decision | Choice |
|----------|--------|
| Worker host | Supabase Edge Function `process-email-queue` |
| Local vs prod DB | Same hosted project (accepted) |
| TanStack route | **Full removal** — no proxy |
| Immediate drain after enqueue | Keep — `fetch` Edge Function instead of in-process handler |
| Auth | `Authorization: Bearer <service_role JWT>`; reject otherwise |
| Cron URL | Vault `supabase_url` + `/functions/v1/process-email-queue` (reusable base for future functions) |

---

## Architecture

```
sendEmail / admin test          pg_cron (every minute)
        │                                │
        ▼                                ▼
  enqueue_email RPC              net.http_post
        │                                │
        └──────────► POST {SUPABASE_URL}/functions/v1/process-email-queue
                              │
                              ▼
                     read_email_batch → Resend → delete_email / DLQ
                     update email_send_log / email_send_state
```

**URL shape:** `https://<project-ref>.supabase.co/functions/v1/process-email-queue`

App builds this from `VITE_SUPABASE_URL` or `SUPABASE_URL` already in server env. Cron uses the same hosted project URL in a new migration.

---

## Behavior (unchanged)

Port logic from `src/email/server/queue-process.ts`:

- Auth: Bearer token must equal service role key
- Respect `email_send_state.retry_after_until`, `batch_size`, `send_delay_ms`, TTL
- Queue: `transactional_emails` only
- Max 3 attempts; permanent 400/422 → DLQ; 429 → set `retry_after_until`
- Update `email_send_log` statuses (`sent` / `dlq` / errors)

Secrets on the function: `RESEND_API_KEY`. Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the project.

---

## Call-site changes

| Location | Change |
|----------|--------|
| `src/email/send-email.ts` | Drain via HTTP to Edge Function |
| `src/email/server/admin-email-test.ts` | Same shared drain helper |
| `src/routes/lovable/email/queue/process.ts` | **Delete** |
| `src/email/server/queue-process.ts` | **Delete** after port |
| Cron migrations | New migration reschedules job to functions URL |

Shared helper (app): `drainTransactionalEmailQueue()` in something like `src/email/drain-email-queue.ts` so callers do not duplicate fetch logic.

---

## Out of scope

- Separate local Supabase stack / second project
- Changing Resend templates or enqueue payload shape
- Auth SMTP / Lovable auth email queues

---

## Success criteria

1. Admin test email and `sendEmail` drain via Edge Function (no TanStack queue route).
2. `pg_cron` `process-email-queue` POSTs to `/functions/v1/process-email-queue`.
3. Unauthorized calls return 401/403.
4. Pending queue messages still send and mark `email_send_log` as `sent`.
