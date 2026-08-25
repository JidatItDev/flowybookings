# Downgrade Premature-Charge Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a real billing bug found during manual QA (D1 test case): scheduling a plan downgrade currently patches the shop's live Mollie subscription immediately, which resets Mollie's internal billing anchor to "now" and triggers a premature charge — sometimes within minutes — instead of waiting until the actual paid-through period ends. Also close the UX gaps this bug's investigation surfaced: no way to undo a scheduled downgrade short of a full cancel, and no protection against re-scheduling the same downgrade twice.

**Architecture:** Defer all Mollie interaction for a downgrade from "schedule time" to "apply time." `plan-downgrade.ts` will only ever write `pending_plan`/`pending_plan_effective_at` locally — it will not touch Mollie at all. `billing-expiry.ts`'s existing "apply scheduled plan changes" cron step (which already flips `shops.plan` when `pending_plan_effective_at` arrives) will additionally patch the live Mollie subscription to the new plan's price *at that moment* — which is exactly when the real renewal is due, so there is no "reset to now" problem (now genuinely is the renewal boundary). A new `plan-downgrade-cancel` endpoint lets an owner undo a still-pending downgrade with a pure local write (no Mollie call needed, since Mollie was never touched). The pricing tiles gain a "Scheduled" state so re-clicking the same downgrade target is a no-op instead of re-triggering the flow.

**Tech Stack:** TanStack Start (React + server routes), Supabase Postgres, Mollie API, Vitest.

**Spec:** This conversation — live QA (D1 test case) surfaced the bug via real Mollie test-mode data: a Pro-yearly subscription's amount was patched to Starter's price at 15:17, and Mollie charged it at 15:20 (collection date the next day) despite `plan_expires_at` being a year out. Root cause confirmed in `src/shop/billing/server/mollie-subscriptions.ts:81-113` (`patchMollieSubscription`) — every PATCH includes `interval` in the body, and Mollie resets the subscription's next-payment schedule to "now" whenever `interval` is present in a PATCH, even when the value is unchanged.

User decisions from this conversation:
1. Fix approach: defer the Mollie patch to period-end (cron apply time), not "keep patching immediately but preserve the anchor."
2. Add a distinct "cancel scheduled downgrade, keep current plan" action, separate from full subscription cancel.
3. Re-picking the same downgrade target while one is already pending is a no-op in the UI (disabled tile, no repeat API call).
4. (Already correctly handled, no work needed) A new *paid* checkout already clears `pending_plan`/`pending_plan_effective_at` as a side effect of `mollie-webhook.ts`'s "paid" branch (`src/shop/payments/server/mollie-webhook.ts:399-400`) — confirmed by reading the code, not a gap.

## Global Constraints

- No proration anywhere in this app (existing rule, `.claude/HANDOFF.md` §4) — a downgrade's lower price must never apply, and Mollie must never charge, before the currently-paid-through period actually ends.
- If patching Mollie fails when the cron tries to apply a pending downgrade, do NOT flip `shops.plan` locally that run — leave `pending_plan` in place and retry next cron tick. Never let the local plan (and its feature access) diverge from what Mollie is actually charging.
- No email for the new "cancel scheduled downgrade" action — an in-app notification is enough; adding a new email template (registry entry, React component, subject line) is disproportionate scope for an undo action. Mirrors how `resolveCancelPreflight`'s "already_cancelled" no-op skips re-sending email too.
- Follow the existing pure-decision-function-plus-thin-handler pattern used throughout `src/shop/billing/server/` (e.g. `cancel-outcome.ts` + `plan-cancel.ts`) — new logic that can be unit tested without mocking Supabase/Mollie goes in a `*-decision.ts` file with its own test file.

---

## File Structure

- Modify: `src/shop/billing/server/plan-downgrade.ts` — remove all Mollie interaction; only writes `pending_plan`/`pending_plan_effective_at` now.
- Modify: `src/shop/billing/server/plan-downgrade-decision.ts` — add `resolveDowngradeCancelPreflight`.
- Modify: `src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts` — tests for the new function.
- Create: `src/shop/billing/server/plan-downgrade-cancel.ts` — new handler, clears a pending downgrade.
- Create: `src/routes/api.billing.plan-downgrade-cancel.ts` — route wiring for the new handler.
- Modify: `src/shop/billing/server/billing-expiry.ts` — the "apply scheduled plan changes" step now patches Mollie's subscription to the new plan's price at apply time, and skips (retries next run) if that patch fails.
- Modify: `src/shop/billing/ShopBillingCard.tsx` — "Cancel scheduled downgrade" action next to the existing "Scheduled: X on Y" line.
- Modify: `src/shop/billing/UpgradePage.tsx` — a pricing tile matching `activeShop.pending_plan` shows a "Scheduled" badge and disables its button instead of allowing a repeat downgrade call.
- Modify: `src/shared/lib/translations/en.ts`, `src/shared/lib/translations/nl.ts` — new keys.

---

### Task 1: `resolveDowngradeCancelPreflight` — pure decision function + tests

**Files:**
- Modify: `src/shop/billing/server/plan-downgrade-decision.ts`
- Test: `src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts`

**Interfaces:**
- Produces: `resolveDowngradeCancelPreflight(shop: { pending_plan: string | null | undefined }): "ok" | "no_pending_downgrade"` — consumed by Task 2 (`plan-downgrade-cancel.ts`).

- [ ] **Step 1: Write the failing tests**

Add to `src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts`:

```ts
import { resolveDowngradeCancelPreflight } from "@/shop/billing/server/plan-downgrade-decision";

describe("resolveDowngradeCancelPreflight", () => {
  test("a shop with a pending downgrade can cancel it", () => {
    expect(resolveDowngradeCancelPreflight({ pending_plan: "starter" })).toBe("ok");
  });
  test("a shop with no pending downgrade has nothing to cancel", () => {
    expect(resolveDowngradeCancelPreflight({ pending_plan: null })).toBe("no_pending_downgrade");
  });
  test("undefined pending_plan is also 'nothing to cancel'", () => {
    expect(resolveDowngradeCancelPreflight({ pending_plan: undefined })).toBe("no_pending_downgrade");
  });
});
```

(Add this `import` to the existing import line at the top of the file instead of a new line, i.e. change `import { isValidDowngrade, resolveDowngradeCycle } from "@/shop/billing/server/plan-downgrade-decision";` to also include `resolveDowngradeCancelPreflight`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts`
Expected: FAIL — `resolveDowngradeCancelPreflight` is not exported yet.

- [ ] **Step 3: Implement**

Add to `src/shop/billing/server/plan-downgrade-decision.ts`:

```ts
export type DowngradeCancelPreflight = "ok" | "no_pending_downgrade";

/** Whether a shop has a scheduled downgrade that can be cancelled. */
export function resolveDowngradeCancelPreflight(shop: {
  pending_plan: string | null | undefined;
}): DowngradeCancelPreflight {
  return shop.pending_plan ? "ok" : "no_pending_downgrade";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/shop/billing/server/plan-downgrade-decision.ts src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts
git commit -m "feat (billing): add resolveDowngradeCancelPreflight"
```

---

### Task 2: Remove the premature Mollie patch from `plan-downgrade.ts`

**Files:**
- Modify: `src/shop/billing/server/plan-downgrade.ts`

**Interfaces:**
- Consumes: `resolveDowngradeCycle`, `isValidDowngrade` (unchanged, already imported).
- Produces: nothing new — same `POST /api/billing/plan-downgrade` request/response shape, minus the now-removed `mollie_patched`/`mollie_orphans_cancelled` response fields (neither was consumed by any frontend code — confirmed via `grep -rn "mollie_patched\|mollie_orphans_cancelled" src` finding no reads, only the write in this file).

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/shop/billing/server/plan-downgrade.ts` with:

```ts
// Schedule a platform-plan downgrade at period end. Local plan stays until
// pending_plan_effective_at; the live Mollie subscription is NOT touched here.
//
// Why: patching a Mollie subscription's `interval` resets its internal
// next-payment schedule to "now", even when the interval value doesn't
// actually change (confirmed empirically in test mode — see the 2026-08-25
// downgrade-premature-charge-fix plan). Patching it a year early caused an
// unwanted immediate charge. Instead, billing-expiry.ts patches Mollie to the
// new plan's price at the moment it actually applies pending_plan — which is
// exactly when the real renewal is due, so "now" and "the anchor date" are
// the same moment and nothing resets prematurely.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY, type BillingCycle } from "@/admin/settings/platform-billing";
import type { DbPlan } from "@/shared/lib/plans";
import { enqueueSubscriptionEmail } from "@/email/enqueue-subscription-email";
import { isValidDowngrade, resolveDowngradeCycle } from "@/shop/billing/server/plan-downgrade-decision";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.downgrade");

const ALLOWED_TARGETS = new Set(["starter", "pro", "premium"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

  POST: async ({ request }: { request: Request }) => {
    try {
      const body = (await request.json().catch(() => null)) as {
        shop_id?: string;
        target_plan?: string;
        cycle?: string;
      } | null;
      if (!body?.shop_id || !body.target_plan || !ALLOWED_TARGETS.has(body.target_plan)) {
        return json({ error: "invalid_input" }, 400);
      }

      const authHeader = request.headers.get("authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "unauthenticated" }, 401);

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
      const userId = userRes.user.id;

      const { data: shop } = await supabaseAdmin
        .from("shops")
        .select("id, name, owner_id, plan, plan_expires_at, plan_billing_cycle")
        .eq("id", body.shop_id)
        .maybeSingle();
      if (!shop) return json({ error: "shop_not_found" }, 404);

      if (shop.owner_id !== userId) {
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        if (!(roles ?? []).some((r) => r.role === "super_admin")) {
          return json({ error: "forbidden" }, 403);
        }
      }

      const currentPlan = shop.plan as DbPlan;
      const targetPlan = body.target_plan as Exclude<DbPlan, "trial">;
      if (!isValidDowngrade(currentPlan, targetPlan)) {
        return json({ error: "not_a_downgrade" }, 400);
      }
      if (currentPlan === "trial") {
        return json({ error: "no_active_subscription" }, 400);
      }

      const cycle: BillingCycle = resolveDowngradeCycle(body.cycle, shop.plan_billing_cycle);
      const effectiveAt = shop.plan_expires_at;
      if (!effectiveAt) return json({ error: "missing_expiry" }, 400);

      await supabaseAdmin
        .from("shops")
        .update({
          pending_plan: targetPlan,
          pending_plan_effective_at: effectiveAt,
        })
        .eq("id", shop.id);

      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "subscription_downgrade_scheduled",
        shop_id: shop.id,
        actor_user_id: userId,
        actor_email: userRes.user.email ?? null,
        metadata: {
          old_plan: currentPlan,
          pending_plan: targetPlan,
          effective_at: effectiveAt,
          cycle,
        },
      });

      await supabaseAdmin.from("notifications").insert({
        shop_id: shop.id,
        type: "billing",
        title: "Downgrade gepland",
        message: `Je blijft op ${currentPlan} tot ${new Date(effectiveAt).toLocaleDateString("nl-NL")}; daarna ${targetPlan}.`,
        action_url: "/shop/billing",
        metadata: { kind: "subscription", subkind: "downgrade_scheduled", plan: targetPlan },
      });

      await enqueueSubscriptionEmail({
        type: "subscription_downgrade_scheduled",
        shopId: shop.id,
        idempotencyKey: `downgrade_scheduled:${shop.id}:${effectiveAt}`,
        data: {
          plan: targetPlan,
          oldPlan: currentPlan,
          expiresAt: new Date(effectiveAt).toLocaleDateString("nl-NL"),
        },
      });

      log.info("downgrade_scheduled", {
        shop_id: shop.id,
        old_plan: currentPlan,
        pending_plan: targetPlan,
        effective_at: effectiveAt,
      });

      return json({
        ok: true,
        pending_plan: targetPlan,
        pending_plan_effective_at: effectiveAt,
      });
    } catch (err) {
      log.error("internal_error", { err });
      return json({ error: "internal_error", details: (err as Error).message }, 500);
    }
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new (no more references to `getMolliePlatformKeys`/`ensureSinglePlatformSubscription`/`fetchPlanPriceCents` in this file, so no unused-import errors).

Run: `npx eslint src/shop/billing/server/plan-downgrade.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shop/billing/server/plan-downgrade.ts
git commit -m "fix (billing): stop patching Mollie when scheduling a downgrade — was causing a premature charge"
```

---

### Task 3: `billing-expiry.ts` patches Mollie when it actually applies a pending downgrade

**Files:**
- Modify: `src/shop/billing/server/billing-expiry.ts`

**Interfaces:**
- Consumes: `getMolliePlatformKeys` (from `@/shared/lib/mollie-platform`), `fetchPlanPriceCents` (from `@/shop/billing/server/plan-price`), `ensureSinglePlatformSubscription` (from `@/shop/billing/server/mollie-subscriptions`) — all already exist, used elsewhere in this codebase (`plan-checkout.ts`, `plan-downgrade.ts` before Task 2, `mollie-webhook.ts`).
- Produces: no interface change — this cron endpoint's request/response shape is unchanged, only its internal behavior when applying a pending plan.

- [ ] **Step 1: Add the new imports**

At the top of `src/shop/billing/server/billing-expiry.ts`, change:

```ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/admin/settings/platform-billing";
import { cronAuthorized } from "@/server/cron-auth";
import { createLogger } from "@/server/logger";
import {
  resolveExpirySweepAction,
  resolvePendingPlanKeepActive,
} from "@/shop/billing/server/expiry-sweep-decision";
```

to:

```ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY, type BillingCycle } from "@/admin/settings/platform-billing";
import { cronAuthorized } from "@/server/cron-auth";
import { createLogger } from "@/server/logger";
import { getMolliePlatformKeys } from "@/shared/lib/mollie-platform";
import { fetchPlanPriceCents } from "@/shop/billing/server/plan-price";
import { ensureSinglePlatformSubscription } from "@/shop/billing/server/mollie-subscriptions";
import type { DbPlan } from "@/shared/lib/plans";
import {
  resolveExpirySweepAction,
  resolvePendingPlanKeepActive,
} from "@/shop/billing/server/expiry-sweep-decision";
```

- [ ] **Step 2: Widen the pending-shops select and rewrite the apply loop**

Replace:

```ts
    const { data: pendingShops, error: pendingErr } = await supabaseAdmin
      .from("shops")
      .select("id, plan, pending_plan, pending_plan_effective_at, mollie_subscription_id, subscription_status")
      .not("pending_plan", "is", null)
      .not("pending_plan_effective_at", "is", null)
      .lte("pending_plan_effective_at", nowIso);

    if (pendingErr) return json({ error: "fetch_failed", detail: pendingErr.message }, 500);

    for (const shop of pendingShops ?? []) {
      if (!shop.pending_plan) continue;
      const oldPlan = shop.plan;
      const keepActive = resolvePendingPlanKeepActive(shop);
      const { data: updated } = await supabaseAdmin
        .from("shops")
        .update({
          plan: shop.pending_plan,
          pending_plan: null,
          pending_plan_effective_at: null,
          ...(keepActive ? { subscription_status: "active" } : {}),
        })
        .eq("id", shop.id)
        .not("pending_plan", "is", null)
        .select("id")
        .maybeSingle();
      if (!updated) continue;
      pendingAppliedIds.add(shop.id);
      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "subscription_plan_applied",
        shop_id: shop.id,
        metadata: { old_plan: oldPlan, new_plan: shop.pending_plan },
      });
      results.pending_applied.push({ shop_id: shop.id, from: oldPlan, to: shop.pending_plan });
    }
```

with:

```ts
    const { data: pendingShops, error: pendingErr } = await supabaseAdmin
      .from("shops")
      .select(
        "id, plan, pending_plan, pending_plan_effective_at, mollie_subscription_id, mollie_customer_id, plan_billing_cycle, subscription_status",
      )
      .not("pending_plan", "is", null)
      .not("pending_plan_effective_at", "is", null)
      .lte("pending_plan_effective_at", nowIso);

    if (pendingErr) return json({ error: "fetch_failed", detail: pendingErr.message }, 500);

    const hasMollie = getMolliePlatformKeys().length > 0;

    for (const shop of pendingShops ?? []) {
      if (!shop.pending_plan) continue;
      const oldPlan = shop.plan;
      const keepActive = resolvePendingPlanKeepActive(shop);
      const pendingPlan = shop.pending_plan as Exclude<DbPlan, "trial">;
      const cycle: BillingCycle = shop.plan_billing_cycle === "yearly" ? "yearly" : "monthly";

      // Patch Mollie's live subscription to the new plan's price NOW — this is
      // the actual renewal boundary, so "now" and the subscription's real
      // anchor date are the same moment; nothing resets prematurely (unlike
      // patching a year early at schedule time, see plan-downgrade.ts).
      let mollieSubscriptionId = shop.mollie_subscription_id ?? null;
      let nextBillingAt: string | null = null;
      if (hasMollie && shop.mollie_customer_id && mollieSubscriptionId) {
        const amount = await fetchPlanPriceCents(pendingPlan, cycle);
        const synced = await ensureSinglePlatformSubscription({
          customerId: shop.mollie_customer_id,
          shopId: shop.id,
          plan: pendingPlan,
          cycle,
          amountValue: (amount / 100).toFixed(2),
          preferredSubId: mollieSubscriptionId,
        });
        if (!synced) {
          // Don't flip the local plan while Mollie is still charging the OLD
          // amount — that would grant the new (lower) plan's features while
          // still billing the old price. Leave pending_plan in place; the
          // next cron run retries.
          log.error("pending_plan_mollie_sync_failed", { shop_id: shop.id, pending_plan: pendingPlan });
          continue;
        }
        mollieSubscriptionId = synced.subscriptionId;
        nextBillingAt = synced.nextPaymentDate;
      }

      const { data: updated } = await supabaseAdmin
        .from("shops")
        .update({
          plan: shop.pending_plan,
          pending_plan: null,
          pending_plan_effective_at: null,
          ...(keepActive ? { subscription_status: "active" } : {}),
          ...(mollieSubscriptionId ? { mollie_subscription_id: mollieSubscriptionId } : {}),
          ...(nextBillingAt ? { next_billing_at: nextBillingAt } : {}),
        })
        .eq("id", shop.id)
        .not("pending_plan", "is", null)
        .select("id")
        .maybeSingle();
      if (!updated) continue;
      pendingAppliedIds.add(shop.id);
      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "subscription_plan_applied",
        shop_id: shop.id,
        metadata: { old_plan: oldPlan, new_plan: shop.pending_plan, mollie_subscription_id: mollieSubscriptionId },
      });
      results.pending_applied.push({ shop_id: shop.id, from: oldPlan, to: shop.pending_plan });
    }
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/billing/server/billing-expiry.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shop/billing/server/billing-expiry.ts
git commit -m "feat (billing): patch Mollie subscription to the new plan's price when a downgrade actually applies"
```

---

### Task 4: `plan-downgrade-cancel` — new endpoint to undo a scheduled downgrade

**Files:**
- Create: `src/shop/billing/server/plan-downgrade-cancel.ts`
- Create: `src/routes/api.billing.plan-downgrade-cancel.ts`

**Interfaces:**
- Consumes: `resolveDowngradeCancelPreflight` from Task 1.
- Produces: `POST /api/billing/plan-downgrade-cancel` — body `{ shop_id: string }`, auth via `Authorization: Bearer <token>` (owner or super_admin, same pattern as every other billing endpoint in this codebase). Success: `{ ok: true, plan: string }`. Consumed by Task 6 (`ShopBillingCard.tsx`).

- [ ] **Step 1: Write the handler**

```ts
// Cancel a scheduled downgrade — clears pending_plan/pending_plan_effective_at,
// leaving the current plan and live Mollie subscription completely untouched.
// Safe to do with zero Mollie interaction: plan-downgrade.ts never touches
// Mollie when scheduling either — the pending change only becomes real, and
// only then patches Mollie, when billing-expiry.ts applies it at period end.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/admin/settings/platform-billing";
import { resolveDowngradeCancelPreflight } from "@/shop/billing/server/plan-downgrade-decision";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.downgrade_cancel");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

  POST: async ({ request }: { request: Request }) => {
    try {
      const body = (await request.json().catch(() => null)) as { shop_id?: string } | null;
      if (!body?.shop_id) return json({ error: "missing_shop_id" }, 400);

      const authHeader = request.headers.get("authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "unauthenticated" }, 401);

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
      const userId = userRes.user.id;

      const { data: shop } = await supabaseAdmin
        .from("shops")
        .select("id, owner_id, plan, pending_plan")
        .eq("id", body.shop_id)
        .maybeSingle();
      if (!shop) return json({ error: "shop_not_found" }, 404);

      if (shop.owner_id !== userId) {
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        if (!(roles ?? []).some((r) => r.role === "super_admin")) {
          return json({ error: "forbidden" }, 403);
        }
      }

      if (resolveDowngradeCancelPreflight(shop) === "no_pending_downgrade") {
        return json({ error: "no_pending_downgrade" }, 400);
      }

      const cancelledPendingPlan = shop.pending_plan;
      await supabaseAdmin
        .from("shops")
        .update({ pending_plan: null, pending_plan_effective_at: null })
        .eq("id", shop.id);

      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "subscription_downgrade_cancelled",
        shop_id: shop.id,
        actor_user_id: userId,
        actor_email: userRes.user.email ?? null,
        metadata: { plan: shop.plan, cancelled_pending_plan: cancelledPendingPlan },
      });

      await supabaseAdmin.from("notifications").insert({
        shop_id: shop.id,
        type: "billing",
        title: "Geplande downgrade geannuleerd",
        message: `Je blijft op ${String(shop.plan).toUpperCase()}.`,
        action_url: "/shop/billing",
        metadata: { kind: "subscription", subkind: "downgrade_cancelled" },
      });

      log.info("downgrade_cancelled", {
        shop_id: shop.id,
        plan: shop.plan,
        cancelled_pending_plan: cancelledPendingPlan,
      });

      return json({ ok: true, plan: shop.plan });
    } catch (err) {
      log.error("internal_error", { err });
      return json({ error: "internal_error", details: (err as Error).message }, 500);
    }
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
```

Save this as `src/shop/billing/server/plan-downgrade-cancel.ts`.

- [ ] **Step 2: Wire the route**

Create `src/routes/api.billing.plan-downgrade-cancel.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/plan-downgrade-cancel";

export const Route = createFileRoute("/api/billing/plan-downgrade-cancel")({
  server: { handlers },
});
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/billing/server/plan-downgrade-cancel.ts src/routes/api.billing.plan-downgrade-cancel.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shop/billing/server/plan-downgrade-cancel.ts src/routes/api.billing.plan-downgrade-cancel.ts
git commit -m "feat (billing): add plan-downgrade-cancel endpoint to undo a scheduled downgrade"
```

---

### Task 5: i18n keys

**Files:**
- Modify: `src/shared/lib/translations/en.ts`, `src/shared/lib/translations/nl.ts`

- [ ] **Step 1: Add the keys**

In `src/shared/lib/translations/en.ts`, find `"billing.reactivate": "Reactivate",` and add immediately after:

```ts
  "billing.keepCurrentPlan": "Keep current plan",
  "billing.downgradeCancelSuccess": "Scheduled downgrade cancelled — staying on your current plan.",
```

In `src/shared/lib/translations/nl.ts`, find `"billing.reactivate": "Reactiveer",` and add immediately after:

```ts
  "billing.keepCurrentPlan": "Behoud huidig plan",
  "billing.downgradeCancelSuccess": "Geplande downgrade geannuleerd — je blijft op je huidige plan.",
```

In `src/shared/lib/translations/en.ts`, find `"upgrade.previousPlanBadge": "Previous plan",` and add immediately after:

```ts
  "upgrade.scheduledBadge": "Scheduled",
```

In `src/shared/lib/translations/nl.ts`, find `"upgrade.previousPlanBadge": "Vorig plan",` and add immediately after:

```ts
  "upgrade.scheduledBadge": "Gepland",
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/translations/en.ts src/shared/lib/translations/nl.ts
git commit -m "feat (billing): i18n for cancel-scheduled-downgrade and the scheduled-tile badge"
```

---

### Task 6: `ShopBillingCard.tsx` — "Cancel scheduled downgrade" action

**Files:**
- Modify: `src/shop/billing/ShopBillingCard.tsx`

**Interfaces:**
- Consumes: `POST /api/billing/plan-downgrade-cancel` from Task 4.

- [ ] **Step 1: Add the mutation**

In `src/shop/billing/ShopBillingCard.tsx`, immediately after the existing `cancelSubscription` mutation (after its closing `});`), add:

```ts
  const cancelDowngrade = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/billing/plan-downgrade-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shop_id: shopId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "downgrade_cancel_failed");
      }
    },
    onSuccess: () => {
      toast.success(t("billing.downgradeCancelSuccess"));
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
```

- [ ] **Step 2: Add the button next to the "Scheduled" line**

Replace:

```tsx
            {scheduledPlan && scheduledAt ? (
              <span className="ml-2 text-xs text-muted-foreground">
                Scheduled: {planLabel(scheduledPlan)} on {new Date(scheduledAt).toLocaleDateString()}
              </span>
            ) : null}
```

with:

```tsx
            {scheduledPlan && scheduledAt ? (
              <span className="ml-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                Scheduled: {planLabel(scheduledPlan)} on {new Date(scheduledAt).toLocaleDateString()}
                <button
                  type="button"
                  onClick={() => cancelDowngrade.mutate()}
                  disabled={cancelDowngrade.isPending || readOnly}
                  title={readOnlyTitle}
                  className="font-medium text-primary underline hover:no-underline disabled:opacity-50"
                >
                  {t("billing.keepCurrentPlan")}
                </button>
              </span>
            ) : null}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/billing/ShopBillingCard.tsx`
Expected: same 2 pre-existing warnings as before (unrelated to this change — `nextBillingDate` useMemo dependency, `react-refresh/only-export-components` on `usePlanCheckout`), no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/shop/billing/ShopBillingCard.tsx
git commit -m "feat (billing): add a Cancel scheduled downgrade action to the billing card"
```

---

### Task 7: `UpgradePage.tsx` — scheduled-downgrade tile becomes a no-op instead of re-triggering

**Files:**
- Modify: `src/shop/billing/UpgradePage.tsx`

**Interfaces:**
- Consumes: `activeShop.pending_plan` (already available on the shop object — same field `ShopBillingCard.tsx` already reads).

- [ ] **Step 1: Compute `isPendingTarget`**

Immediately after the existing `const isPreviousPlan = isLapsed && previousPlan === p.key;` line, add:

```tsx
          const isPendingTarget = !isLapsed && activeShop?.pending_plan === p.key;
```

- [ ] **Step 2: Add the "Scheduled" badge**

Immediately after the existing `isPreviousPlan` badge block (the one using `t("upgrade.previousPlanBadge")`), add:

```tsx
              {isPendingTarget && !isCurrent && (
                <span className="absolute -top-3 right-6 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {t("upgrade.scheduledBadge")}
                </span>
              )}
```

- [ ] **Step 3: Disable the button and short-circuit its onClick**

Change:

```tsx
                disabled={isCurrent || busy || !canManageBilling || readOnly}
                title={readOnlyTitle}
                onClick={() => {
                  if (!canManageBilling || readOnly) return;
                  if (isCurrent) return;
```

to:

```tsx
                disabled={isCurrent || isPendingTarget || busy || !canManageBilling || readOnly}
                title={readOnlyTitle}
                onClick={() => {
                  if (!canManageBilling || readOnly) return;
                  if (isCurrent || isPendingTarget) return;
```

- [ ] **Step 4: Update the button label**

Change:

```tsx
                {isCurrent
                  ? t("upgrade.currentPlan")
                  : isDowngrade
                    ? t("upgrade.cta.downgrade", { plan: p.name })
                    : isPreviousPlan
                      ? t("upgrade.cta.resubscribe", { plan: p.name })
                      : p.key === "premium"
                        ? t("upgrade.cta.upgradePremium")
                        : t("upgrade.cta.upgradeShort", { plan: p.name })}
```

to:

```tsx
                {isCurrent
                  ? t("upgrade.currentPlan")
                  : isPendingTarget
                    ? t("upgrade.scheduledBadge")
                    : isDowngrade
                      ? t("upgrade.cta.downgrade", { plan: p.name })
                      : isPreviousPlan
                        ? t("upgrade.cta.resubscribe", { plan: p.name })
                        : p.key === "premium"
                          ? t("upgrade.cta.upgradePremium")
                          : t("upgrade.cta.upgradeShort", { plan: p.name })}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/billing/UpgradePage.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shop/billing/UpgradePage.tsx
git commit -m "fix (billing): disable a pricing tile once its downgrade is already scheduled"
```

---

### Task 8: Manual verification

**Files:** none — this is a live-testing checklist against the real Mollie test-mode setup already in use this session.

The live repro shop is `e643c118-e74c-41fc-a6b3-32fc6707a881`, currently on Pro yearly with a downgrade to Starter monthly already incorrectly scheduled (with a stray premature €12.30 charge already fired at `tr_5ioc6J52bYnK6PAQcirVJ` from before this fix). Before verifying the fix, that pre-existing bad state needs cleaning up:

- [ ] **Step 1: Clean up the pre-existing bad state**

```sql
update shops
set pending_plan = null, pending_plan_effective_at = null
where id = 'e643c118-e74c-41fc-a6b3-32fc6707a881';
```

On the Mollie dashboard, cancel the stray `tr_5ioc6J52bYnK6PAQcirVJ` payment if it's still `Awaiting`/uncollected (or let it go through — it's test mode, no real money — but note the subscription `sub_FW76i24k4m`'s amount is now wrong, patched to Starter's price; either manually PATCH it back to Pro's price via the Mollie API, or just let a subsequent successful checkout in this test session naturally re-sync it via `ensureSinglePlatformSubscription`).

- [ ] **Step 2: Re-run D1 with the fix and confirm no premature charge**

Schedule the same Pro→Starter downgrade again. Watch the Mollie dashboard's subscription history for `sub_FW76i24k4m` (or whatever subscription ID exists after step 1's cleanup) for several minutes.

Expect: **no new charge appears.** The subscription's amount/interval stay exactly as they were (still Pro pricing) — nothing about it changes until the cron actually applies the downgrade.

Confirm via SQL:
```sql
select plan, pending_plan, pending_plan_effective_at, mollie_subscription_id
from shops where id = 'e643c118-e74c-41fc-a6b3-32fc6707a881';
-- Expect: plan = 'pro' (unchanged), pending_plan = 'starter', pending_plan_effective_at set,
--         mollie_subscription_id unchanged from before scheduling
```

- [ ] **Step 3: Test the new "Cancel scheduled downgrade" action (D2, updated)**

On `/shop/billing`, click "Keep current plan" next to the "Scheduled: Starter on..." line.

Expect UI: the "Scheduled" line disappears, plan badge still shows Pro.

Confirm via SQL:
```sql
select plan, pending_plan, pending_plan_effective_at from shops where id = 'e643c118-e74c-41fc-a6b3-32fc6707a881';
-- Expect: pending_plan = null, pending_plan_effective_at = null, plan still 'pro'

select action from activity_log where shop_id = 'e643c118-e74c-41fc-a6b3-32fc6707a881' order by created_at desc limit 1;
-- Expect: 'subscription_downgrade_cancelled'
```

- [ ] **Step 4: Test the idempotent re-pick UI**

Schedule the downgrade again (repeat step 2). On `/shop/billing`, go to the pricing tiles — the Starter tile should now show a "Scheduled" badge and its button should read "Scheduled" and be disabled (can't click it again).

- [ ] **Step 5: Test applying a pending downgrade at period end** (optional — requires manipulating `pending_plan_effective_at` into the past, same technique used for X1)

```sql
update shops set pending_plan_effective_at = now() - interval '1 day'
where id = 'e643c118-e74c-41fc-a6b3-32fc6707a881';
```

Then trigger the cron manually:
```bash
curl -X POST http://localhost:8080/hooks/billing-expiry -H "Authorization: Bearer $CRON_SECRET"
```

Expect: `shops.plan` flips to `starter`, `pending_plan`/`pending_plan_effective_at` clear, and **this time** Mollie's subscription amount/interval actually does get patched (check the Mollie dashboard subscription history) — but since this is the real application moment, a charge happening now (or very soon) is *correct*, not premature.

- [ ] **Step 6: Update the QA matrix doc and HANDOFF.md**

Log the D1/D2 results (and this bug + fix) in `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md`'s Results log, following the same format as the other 2026-08-25 rows already there.

---

## Self-Review

**Spec coverage:**
- Defer Mollie patch to period-end → Task 2 (remove from schedule-time) + Task 3 (add at apply-time).
- Retry-not-corrupt on Mollie patch failure at apply-time → Task 3's `continue` on `!synced`.
- Distinct "cancel scheduled downgrade" action → Tasks 1, 4, 6.
- Re-picking the same downgrade target is a no-op → Task 7.
- No email for the cancel-downgrade action → Task 4 only inserts a notification, no `enqueueSubscriptionEmail` call.
- Manual verification against the real (already-corrupted-by-the-bug) live shop, including cleanup → Task 8.

**Placeholder scan:** none found — every step has concrete code, exact file contents, or exact commands.

**Type consistency:** `resolveDowngradeCancelPreflight`'s return type `"ok" | "no_pending_downgrade"` (Task 1) is checked the same way in both its test (Task 1) and its only caller, `plan-downgrade-cancel.ts` (Task 4: `=== "no_pending_downgrade"`). `isPendingTarget` (Task 7) is a new name, doesn't collide with `isPreviousPlan`/`isCurrent`/`isDowngrade` already in that file.
