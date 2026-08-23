# Billing columns SSOT + checkout logger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store Mollie customer/subscription/payment-failed on `shops` columns (not `onboarding`), make `plan-sync` skip Mollie when already paid and run once on return, and log the checkout/webhook path with a tiny stdout logger (local + Render).

**Architecture:** One `createLogger(scope)` used by billing server files. Checkout/webhook/cancel/downgrade/expiry/reconcile read and write `shops.mollie_customer_id`, `shops.mollie_subscription_id`, `shops.payment_failed_at`. Webhook remains the primary paid writer; `plan-sync` is a no-op fetch when local status is already `paid`.

**Tech Stack:** TanStack Start server routes, Supabase service role, existing Mollie helpers. No winston/pino. No new test runner.

**Spec:** `docs/superpowers/specs/2026-08-21-billing-columns-logger-design.md`

## Global Constraints

- Do not git commit unless the user asks.
- User applies the SQL migration; do not run `supabase db` / MCP apply against remote.
- No backfill `UPDATE` from `onboarding` JSON. User deletes test shops.
- No JSON fallback for Mollie ids after this change.
- Do not log Authorization headers, access tokens, API keys, or webhook secrets.
- Do not change product rules (immediate upgrade, scheduled downgrade, cancel-until-expiry, Starter floor, paid-through vs next-charge).
- Do not add `plan_pricing` charge SSOT or webhook `?token=` in this pass.
- Do not migrate console.log outside the billing files listed in the spec.
- Match existing code style; surgical diffs.

## File map

| File | Responsibility |
|---|---|
| `src/server/logger.ts` | Tiny structured logger |
| `supabase/migrations/20260821190000_billing_mollie_columns.sql` | Columns, indexes, owner trigger, `shop_can_accept_bookings` |
| `src/integrations/supabase/types.ts` | Generated-style shop fields |
| `src/shop/billing/server/plan-checkout.ts` | Write `mollie_customer_id` |
| `src/shop/payments/server/mollie-webhook.ts` | Columns + skip Mollie GET if local paid |
| `src/shop/billing/server/plan-sync.ts` | Short-circuit paid |
| `src/shop/billing/UpgradePage.tsx` | Sync once per payment id |
| `plan-cancel.ts`, `plan-downgrade.ts`, `billing-expiry.ts`, `billing-reconcile.ts` | Column reads/writes |
| `src/shared/lib/trial.ts`, `auth-context.tsx`, admin queries/panel | Surface new columns |
| `docs/superpowers/plans/2026-08-21-billing-session-context.md` | Ids live on columns |

---

### Task 1: Tiny logger

**Files:**
- Create: `src/server/logger.ts`

**Interfaces:**
- Produces: `createLogger(scope: string): Logger` with `debug|info|warn|error(msg, ctx?)` and `child(extra)`.

- [ ] **Step 1: Add `src/server/logger.ts`**

```ts
import { serverEnv } from "@/server/env";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCtx = Record<string, unknown>;

export type Logger = {
  debug: (msg: string, ctx?: LogCtx) => void;
  info: (msg: string, ctx?: LogCtx) => void;
  warn: (msg: string, ctx?: LogCtx) => void;
  error: (msg: string, ctx?: LogCtx) => void;
  child: (extra: LogCtx) => Logger;
};

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEY = /authorization|access_token|api[_-]?key|webhook_secret|bearer|password|secret/i;

function activeLevel(): LogLevel {
  const raw = (serverEnv("LOG_LEVEL") ?? "").trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return serverEnv("NODE_ENV") === "production" ? "info" : "debug";
}

function useJson(): boolean {
  const fmt = (serverEnv("LOG_FORMAT") ?? "").trim().toLowerCase();
  if (fmt === "json") return true;
  if (fmt === "pretty") return false;
  return serverEnv("NODE_ENV") === "production";
}

function sanitize(ctx: LogCtx | undefined): LogCtx {
  if (!ctx) return {};
  const out: LogCtx = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (SECRET_KEY.test(k)) continue;
    if (v instanceof Error) {
      out[k] = v.message;
      out[`${k}_name`] = v.name;
      continue;
    }
    out[k] = v;
  }
  return out;
}

function emit(level: LogLevel, scope: string, msg: string, ctx: LogCtx | undefined) {
  if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel()]) return;
  const safe = sanitize(ctx);
  const ts = new Date().toISOString();
  if (useJson()) {
    const line = JSON.stringify({ ts, level, scope, msg, ...safe });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }
  const bits = Object.entries(safe).map(([k, v]) => {
    if (v === null || v === undefined) return `${k}=`;
    if (typeof v === "object") return `${k}=${JSON.stringify(v)}`;
    return `${k}=${String(v)}`;
  });
  const line = bits.length
    ? `[${scope}] ${level} ${msg} ${bits.join(" ")}`
    : `[${scope}] ${level} ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string, bound: LogCtx = {}): Logger {
  const merge = (ctx?: LogCtx): LogCtx => ({ ...bound, ...sanitize(ctx) });
  return {
    debug: (msg, ctx) => emit("debug", scope, msg, merge(ctx)),
    info: (msg, ctx) => emit("info", scope, msg, merge(ctx)),
    warn: (msg, ctx) => emit("warn", scope, msg, merge(ctx)),
    error: (msg, ctx) => emit("error", scope, msg, merge(ctx)),
    child: (extra) => createLogger(scope, merge(extra)),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors from `src/server/logger.ts` (pre-existing errors elsewhere are not this task).

---

### Task 2: Migration SQL (user applies)

**Files:**
- Create: `supabase/migrations/20260821190000_billing_mollie_columns.sql`

- [ ] **Step 1: Write the migration (no backfill UPDATE)**

```sql
-- Shop-level Mollie pointers as columns. No JSON backfill (test data will be wiped).

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS mollie_customer_id text,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;

COMMENT ON COLUMN public.shops.mollie_customer_id IS 'Platform Mollie customer id (cst_…)';
COMMENT ON COLUMN public.shops.mollie_subscription_id IS 'Platform Mollie subscription id (sub_…)';
COMMENT ON COLUMN public.shops.payment_failed_at IS 'First recurring collection failure; 7-day booking grace starts here';

CREATE UNIQUE INDEX IF NOT EXISTS shops_mollie_customer_id_uniq
  ON public.shops (mollie_customer_id)
  WHERE mollie_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shops_mollie_subscription_id_uniq
  ON public.shops (mollie_subscription_id)
  WHERE mollie_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_owner_billing_column_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF public.is_shop_owner(auth.uid(), OLD.id) THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at
       OR NEW.plan_billing_cycle IS DISTINCT FROM OLD.plan_billing_cycle
       OR NEW.pending_plan IS DISTINCT FROM OLD.pending_plan
       OR NEW.pending_plan_effective_at IS DISTINCT FROM OLD.pending_plan_effective_at
       OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
       OR NEW.next_billing_at IS DISTINCT FROM OLD.next_billing_at
       OR NEW.mollie_customer_id IS DISTINCT FROM OLD.mollie_customer_id
       OR NEW.mollie_subscription_id IS DISTINCT FROM OLD.mollie_subscription_id
       OR NEW.payment_failed_at IS DISTINCT FROM OLD.payment_failed_at
    THEN
      RAISE EXCEPTION 'billing_columns_owner_update_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_can_accept_bookings(_shop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plan;
  v_expires timestamptz;
  v_failed_at timestamptz;
  v_sub_status text;
BEGIN
  SELECT plan, plan_expires_at, subscription_status, payment_failed_at
    INTO v_plan, v_expires, v_sub_status, v_failed_at
    FROM public.shops
   WHERE id = _shop_id;

  IF v_plan IS NULL THEN
    RETURN false;
  END IF;

  IF v_plan = 'trial' THEN
    RETURN v_expires IS NULL OR v_expires > now();
  END IF;

  IF v_sub_status = 'payment_failed' AND v_failed_at IS NOT NULL THEN
    RETURN v_failed_at > (now() - interval '7 days');
  END IF;

  RETURN true;
END;
$$;
```

- [ ] **Step 2: Tell the user to apply it** (do not apply remotely). Pause writers that touch new columns until they confirm.

---

### Task 3: Types + UI/auth readers

**Files:**
- Modify: `src/integrations/supabase/types.ts` (`shops` Row/Insert/Update)
- Modify: `src/auth/lib/auth-context.tsx` (`ShopRow` + both `.select(...)` strings)
- Modify: `src/shared/lib/trial.ts`
- Modify: `src/admin/shared/admin-queries.ts` (shop select + type)
- Modify: `src/admin/shops/SubscriptionPanel.tsx`

- [ ] **Step 1: Add to `shops.Row` / Insert / Update in types.ts**

`mollie_customer_id: string | null` and `payment_failed_at: string | null` next to existing `mollie_subscription_id`.

- [ ] **Step 2: `ShopRow` in auth-context**

Add `payment_failed_at: string | null`. Append `payment_failed_at` to both shop `select(...)` lists (the ones around lines 184 and 206).

- [ ] **Step 3: `getTrialState`**

Change the shop argument type to include `payment_failed_at?: string | null`. Read failure time from `shop.payment_failed_at`, not `onboarding.payment_failed_at`. Keep `cancelledAt` as null unless you still have a column (spec: no `subscription_cancelled_at` — leave `cancelledAt` null; UI already uses `subscription_status`). Stop reading `ob.subscription_status`; use `shop.subscription_status` only.

- [ ] **Step 4: Admin**

Add `mollie_customer_id` to the admin shop select string and `Shop` type. In `SubscriptionPanel`, add a read-only input under the existing subscription id field.

---

### Task 4: Checkout writes `mollie_customer_id`

**Files:**
- Modify: `src/shop/billing/server/plan-checkout.ts`

- [ ] **Step 1: Select and write the column**

Change shop select to include `mollie_customer_id` (drop unused `mollie_subscription_id` on this query if it was only selected, or keep it unused — prefer `mollie_customer_id`).

Replace onboarding customer lookup:

```ts
import { createLogger } from "@/server/logger";

const log = createLogger("billing.checkout");
```

```ts
let mollieCustomerId = shop.mollie_customer_id ?? null;

if (!mollieCustomerId) {
  // existing Mollie POST /v2/customers
  if (custRes.ok) {
    mollieCustomerId = cust.id;
    await supabaseAdmin
      .from("shops")
      .update({ mollie_customer_id: mollieCustomerId })
      .eq("id", shop.id);
    log.info("mollie_customer_created", { shop_id: shop.id, mollie_customer_id: mollieCustomerId });
  } else {
    // existing fail path + log.error
  }
}
```

Do **not** write `onboarding`. Keep `mollie_customer_id` on Mollie payment metadata (hint for webhook). After creating the `tr_`, `log.info("checkout_created", { shop_id, payment_id, mollie_id, plan, cycle, kind: paymentKind, amount_cents })`. Replace `console.error` with `log.error`.

- [ ] **Step 2: Typecheck the file** (`npx tsc --noEmit`).

---

### Task 5: Webhook / lifecycle uses columns

**Files:**
- Modify: `src/shop/payments/server/mollie-webhook.ts`

**Interfaces:**
- Consumes: shop columns `mollie_customer_id`, `mollie_subscription_id`, `payment_failed_at`
- `processMolliePaymentNotification` still exported for plan-sync

- [ ] **Step 1: Logger + skip Mollie GET when local already paid**

At top: `const log = createLogger("billing.webhook");`

In `processMolliePaymentNotification`, after loading `payment`:

```ts
if (payment?.status === "paid") {
  log.info("already_paid_skip_mollie", {
    mollie_id: mollieId,
    payment_id: payment.id,
    shop_id: payment.shop_id,
    source: logAction,
  });
  return {
    ingested: false,
    local_status: "paid",
    mollie_status: "paid",
  };
}
```

Then fetch Mollie as today. Replace `console.log("[mollie/webhook]", logAction, …)` with `log.info(logAction, { … })`. Keep `activity_log` inserts.

- [ ] **Step 2: `handleSubscriptionLifecycle` shop reads/writes**

Select `plan, plan_expires_at, onboarding, name, mollie_customer_id, mollie_subscription_id, payment_failed_at` (drop using onboarding for Mollie ids). Prefer:

```ts
const mollieCustomerId =
  (opts.metadata.mollie_customer_id as string | undefined) ??
  prevShop?.mollie_customer_id ??
  null;
let mollieSubscriptionId = prevShop?.mollie_subscription_id ?? null;
```

On paid shop update, set columns (do not spread Mollie keys into `onboarding`):

```ts
await supabaseAdmin
  .from("shops")
  .update({
    plan,
    plan_expires_at: expiry,
    plan_billing_cycle: cycle,
    next_billing_at: nextBillingAt,
    pending_plan: null,
    pending_plan_effective_at: null,
    mollie_customer_id: mollieCustomerId,
    mollie_subscription_id: mollieSubscriptionId,
    payment_failed_at: null,
    subscription_status: "active",
  })
  .eq("id", opts.shopId);
```

On recurring unpaid: keep updating `next_billing_at` + `subscription_status: "active"` only.

On recurring failed: select `payment_failed_at`; `failedAt = existing ?? now`; update `subscription_status: "payment_failed"`, `payment_failed_at: failedAt` — **do not** touch onboarding.

- [ ] **Step 3: Recurring shop lookup**

```ts
.eq("mollie_subscription_id", mollie.subscriptionId)
```

instead of `.contains("onboarding", { mollie_subscription_id })`.

- [ ] **Step 4: Replace remaining `console.log` / `console.error` in this file with `log.info` / `log.error`.**

---

### Task 6: `plan-sync` short-circuit + UpgradePage once

**Files:**
- Modify: `src/shop/billing/server/plan-sync.ts`
- Modify: `src/shop/billing/UpgradePage.tsx`

- [ ] **Step 1: plan-sync**

After loading payment, if `payment.status === "paid"`:

```ts
const log = createLogger("billing.sync");
log.info("return_sync_skipped_already_paid", {
  payment_id: payment.id,
  shop_id: payment.shop_id,
});
const { data: shopAfter } = await supabaseAdmin
  .from("shops")
  .select("plan, subscription_status, plan_expires_at")
  .eq("id", shop.id)
  .maybeSingle();
return json({
  ok: true,
  local_status: "paid",
  mollie_status: "paid",
  plan: shopAfter?.plan ?? shop.plan,
  subscription_status: shopAfter?.subscription_status ?? null,
});
```

Do not call `processMolliePaymentNotification` in that branch. Log `return_sync_applied` when it does call through.

- [ ] **Step 2: UpgradePage effect — once per payment id**

Use a module-level `Set` (survives Strict Mode better than a ref that resets) or a `useRef` Set:

```ts
const syncedPayments = new Set<string>();
```

At the start of the effect, if `paymentId` and `syncedPayments.has(paymentId)` return. Immediately `syncedPayments.add(paymentId)` before the fetch. Then fetch, toast, invalidate, `navigate({ to: "/shop/billing", search: {}, replace: true })`.

Do not add `refreshShops` before navigate in a way that re-entry is possible; the Set is the lock.

---

### Task 7: Cancel, downgrade, expiry, reconcile

**Files:**
- Modify: `src/shop/billing/server/plan-cancel.ts`
- Modify: `src/shop/billing/server/plan-downgrade.ts`
- Modify: `src/shop/billing/server/billing-expiry.ts`
- Modify: `src/shop/billing/server/billing-reconcile.ts`
- Modify: `src/shop/billing/server/mollie-subscriptions.ts` (logger only)

- [ ] **Step 1: Cancel**

Select `mollie_customer_id, mollie_subscription_id` instead of onboarding. DELETE using those columns. Update:

```ts
{
  subscription_status: "cancelled",
  pending_plan: null,
  pending_plan_effective_at: null,
  next_billing_at: null,
  mollie_subscription_id: null,
}
```

Keep `mollie_customer_id`. Do not write `onboarding.subscription_cancelled_at`. Log `subscription_cancelled`.

- [ ] **Step 2: Downgrade**

Read `mollie_customer_id` / `mollie_subscription_id` from columns. After `ensureSinglePlatformSubscription`, update columns (`mollie_subscription_id`, `next_billing_at`) not onboarding. Log `downgrade_scheduled`.

- [ ] **Step 3: Expiry**

`hasLiveMollieSubscription` takes `mollie_subscription_id: string | null`. Select that column instead of onboarding. On expire-to-starter update `mollie_subscription_id: null` (keep customer id). Remove onboarding spread. Log skips and expiries.

- [ ] **Step 4: Reconcile**

`customerId = shop.mollie_customer_id`. Select that column. Prefer calling `processMolliePaymentNotification(p.id, "received")` in-process instead of HTTP POST to `/api/mollie/webhook` (avoids missing webhook secret later; same process). Log `reconcile_replayed`.

- [ ] **Step 5: mollie-subscriptions.ts** — `createLogger("billing.mollie_sub")` for list/patch/create/cancel failures (replace console.error).

---

### Task 8: Session context + smoke

**Files:**
- Modify: `docs/superpowers/plans/2026-08-21-billing-session-context.md` — SSOT table: Mollie ids are `shops.mollie_customer_id` / `shops.mollie_subscription_id`, not onboarding.

- [ ] **Step 1: Update that doc** (one table row change + open/next note: columns pass).

- [ ] **Step 2: After user applies migration and deletes old test shops, one Starter monthly checkout.**

Expect:
- SQL: `mollie_customer_id` and `mollie_subscription_id` set; `payment_failed_at` null.
- Logs: `checkout_created` → `received` (webhook) → `return_sync_skipped_already_paid` (at most once).
- Admin panel shows both ids.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Logger | 1 |
| Migration, trigger, grace RPC | 2 |
| Types / trial / admin | 3 |
| Checkout writes customer id | 4 |
| Webhook columns + skip GET | 5 |
| plan-sync + once UI | 6 |
| Cancel/downgrade/expiry/reconcile | 7 |
| Docs + smoke | 8 |
| No backfill / no JSON fallback | 2, 4–7 |
| Price SSOT / webhook token | Explicitly out of scope |
