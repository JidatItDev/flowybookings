# Email Queue Edge Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move transactional email queue processing from the TanStack `/lovable/email/queue/process` route to Supabase Edge Function `process-email-queue`, and point cron + app drain callers at it.

**Architecture:** Port `queue-process.ts` into `supabase/functions/process-email-queue`. App drains with `fetch` to `{SUPABASE_URL}/functions/v1/process-email-queue`. Cron migration updates `net.http_post` URL to the same endpoint. Delete the TanStack route and old handler.

**Tech Stack:** Supabase Edge Functions (Deno), pg_cron + pg_net, existing Resend + PGMQ RPCs, TanStack app server env.

## Global Constraints

- Shared hosted Supabase project for local and production (no env isolation).
- Full cutover — no TanStack proxy route left behind.
- Auth remains service-role Bearer only.
- Do not change enqueue payload or template schema.

---

### Task 1: Edge Function `process-email-queue`

**Files:**
- Create: `supabase/functions/process-email-queue/index.ts`
- Modify (optional config): `supabase/config.toml` — add `[functions.process-email-queue]` with `verify_jwt = true` if needed

**Interfaces:**
- Consumes: RPCs `read_email_batch`, `delete_email`, `move_to_dlq`; tables `email_send_state`, `email_send_log`; env `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Produces: `POST` handler returning JSON `{ processed } | { skipped } | { error }` with same status semantics as current TanStack handler

- [ ] **Step 1: Create the Edge Function**

Port logic from `src/email/server/queue-process.ts` into Deno. Use `https://esm.sh/@supabase/supabase-js@2` (same as `seed-demo-users`). Keep `MAX_ATTEMPTS = 3`, queue name `transactional_emails`, Resend fetch, DLQ/TTL/rate-limit behavior identical.

Auth check:

```typescript
const authHeader = req.headers.get("Authorization");
if (!authHeader?.startsWith("Bearer ")) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
const token = authHeader.slice("Bearer ".length).trim();
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!serviceKey || token !== serviceKey) {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
```

- [ ] **Step 2: Document / set secret**

Ensure `RESEND_API_KEY` is set for the project:

```bash
supabase secrets set RESEND_API_KEY=re_... --project-ref jqpxkpbhduqireagwjxy
```

(Do not commit the key. Note in `.env.example` that the Edge Function needs this secret on Supabase.)

- [ ] **Step 3: Deploy**

```bash
supabase functions deploy process-email-queue --project-ref jqpxkpbhduqireagwjxy
```

Expected: deploy succeeds; function listed for the project.

---

### Task 2: App drain helper + call-site cutover

**Files:**
- Create: `src/email/drain-email-queue.ts`
- Modify: `src/email/send-email.ts`
- Modify: `src/email/server/admin-email-test.ts`
- Modify: `.env.example` (note Edge Function secret / drain URL)

**Interfaces:**
- Consumes: `serverEnv("VITE_SUPABASE_URL" | "SUPABASE_URL")`, `serverEnv("SUPABASE_SERVICE_ROLE_KEY")`
- Produces: `drainTransactionalEmailQueue(): Promise<unknown | null>`

- [ ] **Step 1: Add shared drain helper**

```typescript
// src/email/drain-email-queue.ts
import { serverEnv } from "@/server/env";

export async function drainTransactionalEmailQueue(): Promise<unknown | null> {
  const supabaseUrl = (serverEnv("VITE_SUPABASE_URL") || serverEnv("SUPABASE_URL") || "").replace(/\/$/, "");
  const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.warn("[drainTransactionalEmailQueue] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/process-email-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: "{}",
  });
  if (!res.ok) {
    console.error("[drainTransactionalEmailQueue] failed", res.status, await res.text());
    return null;
  }
  return res.json().catch(() => null);
}
```

- [ ] **Step 2: Update `send-email.ts`**

Remove dynamic import of `@/email/server/queue-process` and local `drainTransactionalEmailQueue`. Import and call the shared helper after enqueue.

- [ ] **Step 3: Update `admin-email-test.ts`**

Remove `queueHandlers` import; call `drainTransactionalEmailQueue()` after `sendEmail`; return drained JSON in response as today.

---

### Task 3: Reschedule pg_cron to Edge Function URL

**Files:**
- Create: `supabase/migrations/20260820120000_email_queue_edge_function_cron.sql`

**Interfaces:**
- Consumes: vault `supabase_url`, vault `email_queue_service_role_key`
- Produces: cron job `process-email-queue` POSTing to `rtrim(supabase_url,'/') || '/functions/v1/process-email-queue'`

- [ ] **Step 1: Write migration**

Unschedule existing job; reschedule with URL built from vault `supabase_url` + function path; Bearer from `email_queue_service_role_key`.

- [ ] **Step 2: Operator sets vault secrets**, then applies migration (`db push` / SQL editor). Agent does **not** deploy.

---

### Task 4: Remove TanStack queue worker

**Files:**
- Delete: `src/routes/lovable/email/queue/process.ts`
- Delete: `src/email/server/queue-process.ts`
- Regenerate / allow `src/routeTree.gen.ts` update via Vite/TanStack

- [ ] **Step 1: Delete route + handler**
- [ ] **Step 2: Confirm no remaining imports** of `queue-process` or `/lovable/email/queue/process` in `src/`
- [ ] **Step 3: Smoke-check** admin test email or enqueue + drain returns `{ processed: N }` from Edge Function

---

## Verification

1. `curl -X POST "$SUPABASE_URL/functions/v1/process-email-queue" -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" -d '{}'` → 200 JSON.
2. Wrong/missing Bearer → 401/403.
3. Admin system-test email sends and log status becomes `sent`.
4. `cron.job` command for `process-email-queue` contains `/functions/v1/process-email-queue`, not `flowybookings.com`.
