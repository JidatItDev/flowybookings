# Billing Cycle Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a shop switch its current plan's billing cycle (monthly ↔ yearly) without changing tier, using the same asymmetric rule already approved for tier changes: anything that increases commitment (higher tier, or switching to yearly) happens immediately and is charged in full now; anything that decreases it (lower tier, or switching to monthly) is deferred until the currently-paid-through period ends.

**Architecture:** Generalize the existing tier-only downgrade machinery (`pending_plan`/`pending_plan_effective_at`, `plan-downgrade.ts`, the `billing-expiry.ts` cron apply step) to also carry an optional target cycle (`pending_billing_cycle`, new column). A single pure function, `resolvePlanChangeDirection`, replaces the narrower `isValidDowngrade`/`resolveDowngradeCycle` pair and classifies *any* (current plan, current cycle) → (target plan, target cycle) request as `"immediate"` (goes through the existing checkout flow, unchanged), `"deferred"` (goes through the downgrade-scheduling flow, extended to store cycle too), or `"noop"`. The existing pricing-tile toggle (no new UI surface) drives which cycle is being requested for the current tier, reusing the same tile grid the app already uses for every other billing action.

**Tech Stack:** TanStack Start (React), Supabase Postgres, Mollie API, Vitest.

**Spec:** This conversation. User decisions: (1) asymmetric deferred model, generalized from the already-approved tier-downgrade pattern; (2) reuse the existing monthly/yearly toggle on `/shop/billing` rather than building a separate dedicated control — toggling it while looking at your own current-tier tile turns that tile's button into a cycle-switch action instead of the disabled "Current Plan" state.

## Global Constraints

- No proration anywhere in this app (existing rule) — a cycle switch is either a full new charge now (yearly) or a deferred no-cost change at renewal (monthly), never a partial credit/charge.
- Keep the existing no-Mollie-touch-at-schedule-time invariant from the 2026-08-25 downgrade-premature-charge-fix — a cycle-only deferred change must not touch Mollie either, for the same reason (see that plan's Task 2/3 for why).
- `resolvePlanChangeDirection` fully replaces `isValidDowngrade` and `resolveDowngradeCycle` (both are only used inside `plan-downgrade.ts`, which this plan rewrites anyway) — remove them and their tests rather than leaving dead code alongside the new function.
- Match the existing pure-decision-function-plus-thin-handler pattern already used throughout `src/shop/billing/server/`.

---

## File Structure

- Create: `supabase/migrations/20260825140000_shop_pending_billing_cycle.sql` — new `shops.pending_billing_cycle` column.
- Modify: `src/shop/billing/server/plan-downgrade-decision.ts` — replace `isValidDowngrade`/`resolveDowngradeCycle` with `resolvePlanChangeDirection`.
- Modify: `src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts` — replace their tests accordingly.
- Modify: `src/shop/billing/server/plan-downgrade.ts` — accept and store a target cycle, validate via `resolvePlanChangeDirection`.
- Modify: `src/shop/billing/server/plan-downgrade-cancel.ts` — also clear `pending_billing_cycle`.
- Modify: `src/shop/billing/server/billing-expiry.ts` — apply `pending_billing_cycle` (falling back to the current cycle) when a pending change lands.
- Modify: `src/shop/billing/UpgradePage.tsx` — tile classification (`isCurrent`/`isPendingTarget`/`isDowngrade`) factors in cycle; new cycle-switch CTA copy and confirm dialogs.
- Modify: `src/shared/lib/translations/en.ts`, `src/shared/lib/translations/nl.ts` — new keys.

---

### Task 1: `resolvePlanChangeDirection` — replace the narrower decision functions

**Files:**
- Modify: `src/shop/billing/server/plan-downgrade-decision.ts`
- Modify: `src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts`

**Interfaces:**
- Produces: `resolvePlanChangeDirection(current: { plan: string; cycle: string | null | undefined }, target: { plan: string; cycle: string }): "immediate" | "deferred" | "noop"` — consumed by Task 3 (`plan-downgrade.ts`) and referenced conceptually by Task 6 (`UpgradePage.tsx`, which reimplements the same rule locally with already-imported client-safe `TIER_RANK`/`tierOf` rather than importing a `server/` module into client code — see Task 6 for why).
- Removes: `isValidDowngrade`, `resolveDowngradeCycle` (both only used inside `plan-downgrade.ts`, rewritten in Task 3).

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import {
  resolvePlanChangeDirection,
  resolveDowngradeCancelPreflight,
} from "@/shop/billing/server/plan-downgrade-decision";

describe("resolvePlanChangeDirection", () => {
  test("a higher tier is immediate, regardless of cycle", () => {
    expect(resolvePlanChangeDirection({ plan: "starter", cycle: "monthly" }, { plan: "pro", cycle: "monthly" })).toBe("immediate");
    expect(resolvePlanChangeDirection({ plan: "starter", cycle: "yearly" }, { plan: "pro", cycle: "monthly" })).toBe("immediate");
  });
  test("a lower tier is deferred, regardless of cycle", () => {
    expect(resolvePlanChangeDirection({ plan: "premium", cycle: "monthly" }, { plan: "pro", cycle: "monthly" })).toBe("deferred");
    expect(resolvePlanChangeDirection({ plan: "premium", cycle: "monthly" }, { plan: "pro", cycle: "yearly" })).toBe("deferred");
  });
  test("same tier, same cycle is a no-op", () => {
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: "monthly" }, { plan: "pro", cycle: "monthly" })).toBe("noop");
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: "yearly" }, { plan: "pro", cycle: "yearly" })).toBe("noop");
  });
  test("same tier, switching to yearly is immediate", () => {
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: "monthly" }, { plan: "pro", cycle: "yearly" })).toBe("immediate");
  });
  test("same tier, switching to monthly is deferred", () => {
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: "yearly" }, { plan: "pro", cycle: "monthly" })).toBe("deferred");
  });
  test("missing/null current cycle defaults to monthly", () => {
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: null }, { plan: "pro", cycle: "monthly" })).toBe("noop");
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: undefined }, { plan: "pro", cycle: "yearly" })).toBe("immediate");
  });
  test("trial is the lowest rank — any real plan is immediate from trial", () => {
    expect(resolvePlanChangeDirection({ plan: "trial", cycle: null }, { plan: "starter", cycle: "monthly" })).toBe("immediate");
  });
});

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts`
Expected: FAIL — `resolvePlanChangeDirection` is not exported yet (the old `isValidDowngrade`/`resolveDowngradeCycle` imports would also now be missing from the file, causing a module error).

- [ ] **Step 3: Rewrite the decision file**

Replace the entire contents of `src/shop/billing/server/plan-downgrade-decision.ts` with:

```ts
// Pure decision helpers for plan-downgrade.ts / plan-downgrade-cancel.ts,
// extracted for testability.

const PLAN_RANK: Record<string, number> = { trial: 0, starter: 1, pro: 2, premium: 3 };

export type PlanChangeDirection = "immediate" | "deferred" | "noop";

/**
 * Classifies any plan/cycle change request. Anything that increases what the
 * shop is committing to (a higher tier, or switching to yearly on the same
 * tier) is immediate and charged in full now, going through the normal
 * checkout flow like any other upgrade. Anything that decreases it (a lower
 * tier, or switching to monthly on the same tier) is deferred to the end of
 * the period already paid for, going through the downgrade-scheduling flow.
 * Same plan + same cycle is a no-op.
 */
export function resolvePlanChangeDirection(
  current: { plan: string; cycle: string | null | undefined },
  target: { plan: string; cycle: string },
): PlanChangeDirection {
  const currentRank = PLAN_RANK[current.plan] ?? 0;
  const targetRank = PLAN_RANK[target.plan] ?? 0;
  if (targetRank > currentRank) return "immediate";
  if (targetRank < currentRank) return "deferred";
  const currentCycle = current.cycle === "yearly" ? "yearly" : "monthly";
  if (currentCycle === target.cycle) return "noop";
  return target.cycle === "yearly" ? "immediate" : "deferred";
}

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
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shop/billing/server/plan-downgrade-decision.ts src/shop/billing/server/__tests__/plan-downgrade-decision.test.ts
git commit -m "feat (billing): add resolvePlanChangeDirection, replacing isValidDowngrade/resolveDowngradeCycle"
```

---

### Task 2: Migration — `shops.pending_billing_cycle`

**Files:**
- Create: `supabase/migrations/20260825140000_shop_pending_billing_cycle.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Billing cycle to apply alongside pending_plan when a scheduled change
-- lands (billing-expiry.ts, at pending_plan_effective_at). Needed so a
-- same-tier cycle switch (e.g. yearly -> monthly) can be scheduled the same
-- way a tier downgrade already is — pending_plan alone can't represent "no
-- tier change, just a cycle change" cleanly since it would equal the
-- current plan. Null means "keep whatever plan_billing_cycle already is" —
-- kept for backward compatibility with any pending downgrade rows written
-- before this column existed.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS pending_billing_cycle text
  CHECK (pending_billing_cycle IS NULL OR pending_billing_cycle IN ('monthly', 'yearly'));

COMMENT ON COLUMN public.shops.pending_billing_cycle IS
  'Billing cycle to apply alongside pending_plan at pending_plan_effective_at. Null keeps the current plan_billing_cycle.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260825140000_shop_pending_billing_cycle.sql
git commit -m "feat (billing): add shops.pending_billing_cycle column"
```

(Per this session's established preference, the user applies migrations to the live Supabase project themselves — do not run this one either.)

---

### Task 3: `plan-downgrade.ts` — accept and store a target cycle

**Files:**
- Modify: `src/shop/billing/server/plan-downgrade.ts`

**Interfaces:**
- Consumes: `resolvePlanChangeDirection` from Task 1.
- Produces: same route (`POST /api/billing/plan-downgrade`), same request shape (`{ shop_id, target_plan, cycle }` — `cycle` already sent by the client today, see Task 6), but `cycle` is now interpreted as the exact target cycle rather than a "sticky yearly" preference. Response unchanged (`{ ok, pending_plan, pending_plan_effective_at }`).

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/shop/billing/server/plan-downgrade.ts` with:

```ts
// Schedule a plan and/or billing-cycle downgrade at period end. Local plan
// stays until pending_plan_effective_at; the live Mollie subscription is NOT
// touched here — see billing-expiry.ts and the 2026-08-25
// downgrade-premature-charge-fix plan for why (patching Mollie's `interval`
// resets its billing anchor to now, so it must only ever happen at the real
// renewal boundary, not when scheduling ahead of time).
//
// "Downgrade" here covers two shapes of change, both deferred per
// resolvePlanChangeDirection: a lower tier (any cycle), or the same tier
// switching from yearly to monthly. Switching a tier UP, or switching TO
// yearly, is immediate and goes through plan-checkout.ts instead — this
// endpoint rejects those.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY, type BillingCycle } from "@/admin/settings/platform-billing";
import type { DbPlan } from "@/shared/lib/plans";
import { enqueueSubscriptionEmail } from "@/email/enqueue-subscription-email";
import { resolvePlanChangeDirection } from "@/shop/billing/server/plan-downgrade-decision";
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
      if (currentPlan === "trial") {
        return json({ error: "no_active_subscription" }, 400);
      }
      const targetPlan = body.target_plan as Exclude<DbPlan, "trial">;
      const targetCycle: BillingCycle = body.cycle === "yearly" ? "yearly" : "monthly";

      const direction = resolvePlanChangeDirection(
        { plan: currentPlan, cycle: shop.plan_billing_cycle },
        { plan: targetPlan, cycle: targetCycle },
      );
      if (direction !== "deferred") {
        return json({ error: direction === "noop" ? "no_change" : "not_a_downgrade" }, 400);
      }

      const effectiveAt = shop.plan_expires_at;
      if (!effectiveAt) return json({ error: "missing_expiry" }, 400);

      await supabaseAdmin
        .from("shops")
        .update({
          pending_plan: targetPlan,
          pending_billing_cycle: targetCycle,
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
          old_cycle: shop.plan_billing_cycle,
          pending_plan: targetPlan,
          pending_cycle: targetCycle,
          effective_at: effectiveAt,
        },
      });

      await supabaseAdmin.from("notifications").insert({
        shop_id: shop.id,
        type: "billing",
        title: "Downgrade gepland",
        message: `Je blijft op ${currentPlan} tot ${new Date(effectiveAt).toLocaleDateString("nl-NL")}; daarna ${targetPlan} (${targetCycle === "yearly" ? "jaarlijks" : "maandelijks"}).`,
        action_url: "/shop/billing",
        metadata: { kind: "subscription", subkind: "downgrade_scheduled", plan: targetPlan, cycle: targetCycle },
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
        pending_cycle: targetCycle,
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
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/billing/server/plan-downgrade.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shop/billing/server/plan-downgrade.ts
git commit -m "feat (billing): plan-downgrade.ts accepts a same-tier cycle-only downgrade"
```

---

### Task 4: `plan-downgrade-cancel.ts` — also clear the pending cycle

**Files:**
- Modify: `src/shop/billing/server/plan-downgrade-cancel.ts`

- [ ] **Step 1: Update the clearing update**

Change:

```ts
      const cancelledPendingPlan = shop.pending_plan;
      await supabaseAdmin
        .from("shops")
        .update({ pending_plan: null, pending_plan_effective_at: null })
        .eq("id", shop.id);
```

to:

```ts
      const cancelledPendingPlan = shop.pending_plan;
      await supabaseAdmin
        .from("shops")
        .update({ pending_plan: null, pending_plan_effective_at: null, pending_billing_cycle: null })
        .eq("id", shop.id);
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/billing/server/plan-downgrade-cancel.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shop/billing/server/plan-downgrade-cancel.ts
git commit -m "fix (billing): plan-downgrade-cancel also clears pending_billing_cycle"
```

---

### Task 5: `billing-expiry.ts` — apply the pending cycle too

**Files:**
- Modify: `src/shop/billing/server/billing-expiry.ts`

- [ ] **Step 1: Widen the pending-shops select**

Change:

```ts
    const { data: pendingShops, error: pendingErr } = await supabaseAdmin
      .from("shops")
      .select(
        "id, plan, pending_plan, pending_plan_effective_at, mollie_subscription_id, mollie_customer_id, plan_billing_cycle, subscription_status",
      )
```

to:

```ts
    const { data: pendingShops, error: pendingErr } = await supabaseAdmin
      .from("shops")
      .select(
        "id, plan, pending_plan, pending_plan_effective_at, pending_billing_cycle, mollie_subscription_id, mollie_customer_id, plan_billing_cycle, subscription_status",
      )
```

- [ ] **Step 2: Use the pending cycle when computing what to patch Mollie to, and apply it to the shop row**

Change:

```ts
      const pendingPlan = shop.pending_plan as Exclude<DbPlan, "trial">;
      const cycle: BillingCycle = shop.plan_billing_cycle === "yearly" ? "yearly" : "monthly";
```

to:

```ts
      const pendingPlan = shop.pending_plan as Exclude<DbPlan, "trial">;
      const cycle: BillingCycle =
        (shop.pending_billing_cycle ?? shop.plan_billing_cycle) === "yearly" ? "yearly" : "monthly";
```

Then change the shops update:

```ts
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
```

to:

```ts
      const { data: updated } = await supabaseAdmin
        .from("shops")
        .update({
          plan: shop.pending_plan,
          plan_billing_cycle: cycle,
          pending_plan: null,
          pending_plan_effective_at: null,
          pending_billing_cycle: null,
          ...(keepActive ? { subscription_status: "active" } : {}),
          ...(mollieSubscriptionId ? { mollie_subscription_id: mollieSubscriptionId } : {}),
          ...(nextBillingAt ? { next_billing_at: nextBillingAt } : {}),
        })
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/billing/server/billing-expiry.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shop/billing/server/billing-expiry.ts
git commit -m "feat (billing): billing-expiry.ts applies pending_billing_cycle when a downgrade lands"
```

---

### Task 6: i18n keys

**Files:**
- Modify: `src/shared/lib/translations/en.ts`, `src/shared/lib/translations/nl.ts`

- [ ] **Step 1: Add the keys**

In `src/shared/lib/translations/en.ts`, find `"upgrade.cta.upgradePremium": "Upgrade to Premium →",` and add immediately after:

```ts
  "upgrade.cta.switchToYearly": "Switch to yearly billing →",
  "upgrade.cta.switchToMonthly": "Switch to monthly at renewal",
```

Find `"upgrade.confirmUpgradeFromTrial": "Your upgrade starts immediately and your trial ends. Continue?",` (or whatever its exact English wording is — locate it by key, not by guessing the English text) and add immediately after:

```ts
  "upgrade.confirmCycleUpgrade": "Switch to yearly billing now? You'll be charged the full annual price immediately.",
  "upgrade.confirmCycleDowngrade": "Switch to monthly billing? You'll keep yearly billing until your current term ends, then switch to monthly.",
```

In `src/shared/lib/translations/nl.ts`, find `"upgrade.cta.upgradePremium": "Upgrade naar Premium →",` and add immediately after:

```ts
  "upgrade.cta.switchToYearly": "Wissel naar jaarlijks →",
  "upgrade.cta.switchToMonthly": "Wissel naar maandelijks bij verlenging",
```

Find `"upgrade.confirmUpgradeFromTrial": "Je upgrade start direct en je proefperiode stopt. Doorgaan?",` and add immediately after:

```ts
  "upgrade.confirmCycleUpgrade": "Nu wisselen naar jaarlijkse facturatie? Je wordt direct de volledige jaarprijs in rekening gebracht.",
  "upgrade.confirmCycleDowngrade": "Wisselen naar maandelijkse facturatie? Je behoudt jaarlijkse facturatie tot je huidige periode afloopt, daarna wissel je naar maandelijks.",
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/translations/en.ts src/shared/lib/translations/nl.ts
git commit -m "feat (billing): i18n for cycle-switch CTAs and confirm dialogs"
```

---

### Task 7: `UpgradePage.tsx` — tile classification factors in cycle

**Files:**
- Modify: `src/shop/billing/UpgradePage.tsx`

**Interfaces:**
- Consumes: `activeShop.plan_billing_cycle`, `activeShop.pending_billing_cycle` (new field from Task 2 — same access pattern as the already-read `activeShop.pending_plan`).
- Does NOT import `resolvePlanChangeDirection` from `src/shop/billing/server/...` — that path is for server route handlers; this file re-implements the same rank comparison locally using the already-imported client-safe `TIER_RANK`/`tierOf` from `@/shared/lib/plans`, consistent with how `isDowngrade` already worked before this change.

- [ ] **Step 1: Compute the current cycle and rework the per-tile booleans**

Replace:

```tsx
          // Same plan name alone isn't "current" — a cancelled/expired/payment-failed
          // shop still has plan === its old tier (billing-expiry.ts always lands lapsed
          // shops on "starter"), but there's no live subscription behind it, so it must
          // stay resubscribable rather than permanently disabled.
          const isCurrent = currentPlan === p.key && activeShop?.subscription_status === "active";
          const isPreviousPlan = isLapsed && previousPlan === p.key;
          const isPendingTarget = !isLapsed && activeShop?.pending_plan === p.key;
          const isDowngrade = TIER_RANK[p.tier] < TIER_RANK[currentTier] && !isCurrent;
```

with:

```tsx
          const currentCycle: "monthly" | "yearly" = activeShop?.plan_billing_cycle === "yearly" ? "yearly" : "monthly";
          const sameTier = p.key === currentPlan;
          const isActive = activeShop?.subscription_status === "active";
          // Same plan name alone isn't "current" — a cancelled/expired/payment-failed
          // shop still has plan === its old tier (billing-expiry.ts always lands lapsed
          // shops on "starter"), but there's no live subscription behind it, so it must
          // stay resubscribable rather than permanently disabled. Cycle must match too —
          // toggling to "Yearly" while on Pro-monthly must NOT show Pro as your current,
          // disabled tile; it should offer the cycle switch instead.
          const isCurrent = sameTier && cycle === currentCycle && isActive;
          const isPreviousPlan = isLapsed && previousPlan === p.key;
          const isPendingTarget =
            !isLapsed &&
            activeShop?.pending_plan === p.key &&
            (activeShop?.pending_billing_cycle ?? currentCycle) === cycle;
          const isTierDowngrade = TIER_RANK[p.tier] < TIER_RANK[currentTier];
          // Same tier, dropping from yearly to monthly — deferred, same as a tier downgrade.
          const isCycleDowngrade = sameTier && isActive && !isCurrent && currentCycle === "yearly" && cycle === "monthly";
          // Same tier, moving from monthly to yearly — immediate, same as any upgrade.
          const isCycleUpgrade = sameTier && isActive && !isCurrent && currentCycle === "monthly" && cycle === "yearly";
          const isDowngrade = !isCurrent && (isTierDowngrade || isCycleDowngrade);
```

- [ ] **Step 2: Route the click handler's confirm-dialog text for the two new cases**

Replace:

```tsx
                onClick={() => {
                  if (!canManageBilling || readOnly) return;
                  if (isCurrent || isPendingTarget) return;
                  if (isDowngrade) {
                    if (!window.confirm(t("upgrade.confirmDowngrade", { plan: p.name }))) return;
                    downgrade.mutate(p.key);
                  } else {
                    // Upgrade tijdens trial: laat duidelijk weten dat de trial direct stopt.
                    if (currentPlan === "trial") {
                      if (!window.confirm(t("upgrade.confirmUpgradeFromTrial"))) return;
                    }
                    checkout.mutate({ plan: p.key, cycle });
                  }
                }}
```

with:

```tsx
                onClick={() => {
                  if (!canManageBilling || readOnly) return;
                  if (isCurrent || isPendingTarget) return;
                  if (isDowngrade) {
                    const confirmMsg = isCycleDowngrade
                      ? t("upgrade.confirmCycleDowngrade")
                      : t("upgrade.confirmDowngrade", { plan: p.name });
                    if (!window.confirm(confirmMsg)) return;
                    downgrade.mutate(p.key);
                  } else {
                    // Upgrade tijdens trial: laat duidelijk weten dat de trial direct stopt.
                    if (currentPlan === "trial") {
                      if (!window.confirm(t("upgrade.confirmUpgradeFromTrial"))) return;
                    } else if (isCycleUpgrade) {
                      if (!window.confirm(t("upgrade.confirmCycleUpgrade"))) return;
                    }
                    checkout.mutate({ plan: p.key, cycle });
                  }
                }}
```

- [ ] **Step 3: Update the button label**

Replace:

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

with:

```tsx
                {isCurrent
                  ? t("upgrade.currentPlan")
                  : isPendingTarget
                    ? t("upgrade.scheduledBadge")
                    : isCycleDowngrade
                      ? t("upgrade.cta.switchToMonthly")
                      : isTierDowngrade
                        ? t("upgrade.cta.downgrade", { plan: p.name })
                        : isPreviousPlan
                          ? t("upgrade.cta.resubscribe", { plan: p.name })
                          : isCycleUpgrade
                            ? t("upgrade.cta.switchToYearly")
                            : p.key === "premium"
                              ? t("upgrade.cta.upgradePremium")
                              : t("upgrade.cta.upgradeShort", { plan: p.name })}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/billing/UpgradePage.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shop/billing/UpgradePage.tsx
git commit -m "feat (billing): pricing tiles support switching the current plan's billing cycle"
```

---

### Task 8: Manual verification

**Files:** none — live testing checklist, same test shop as the rest of this session (`e643c118-e74c-41fc-a6b3-32fc6707a881`).

- [ ] **Step 1: Automated checks**

Run: `npm test && npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: all tests pass, only the pre-existing `plan-override.ts:54` tsc error, build succeeds.

- [ ] **Step 2: Cycle upgrade (monthly → yearly), immediate**

With the shop on some plan monthly (e.g. Pro monthly), toggle to "Yearly" on `/shop/billing`. The Pro tile should now show "Switch to yearly billing →" instead of "Current Plan". Click it, confirm the dialog, complete Mollie checkout as Paid.

Expect: `plan_billing_cycle` becomes `'yearly'`, `plan_expires_at` extends ~12 months, a real charge for the full annual price — same as any other upgrade (already proven safe by Y1 this session).

- [ ] **Step 3: Cycle downgrade (yearly → monthly), deferred**

With the shop now on Pro yearly, toggle to "Monthly". The Pro tile should show "Switch to monthly at renewal" instead of "Current Plan". Click it, confirm.

Expect UI: "Scheduled: Pro on {date}" appears (same line as a tier downgrade), Mollie untouched (check the dashboard — no charge, no subscription change, same as this session's D1 verification).

Confirm via SQL:
```sql
select plan, plan_billing_cycle, pending_plan, pending_billing_cycle, pending_plan_effective_at
from shops where id = 'e643c118-e74c-41fc-a6b3-32fc6707a881';
-- Expect: plan = 'pro', plan_billing_cycle = 'yearly' (unchanged),
--         pending_plan = 'pro', pending_billing_cycle = 'monthly', pending_plan_effective_at set
```

- [ ] **Step 4: Cancel the scheduled cycle downgrade**

Click "Keep current plan" (the action built in the 2026-08-25 downgrade-premature-charge-fix plan — should work unchanged for a cycle-only pending change too, since it just clears the three pending columns generically).

Confirm via SQL: `pending_plan`, `pending_billing_cycle`, `pending_plan_effective_at` all null, `plan_billing_cycle` still `'yearly'`.

- [ ] **Step 5: Apply a pending cycle downgrade via the cron**

Re-schedule the yearly→monthly switch from Step 3, then:

```sql
update shops set pending_plan_effective_at = now() - interval '1 day'
where id = 'e643c118-e74c-41fc-a6b3-32fc6707a881';
```

```bash
curl -X POST http://localhost:8080/hooks/billing-expiry -H "Authorization: Bearer $CRON_SECRET"
```

Confirm via SQL: `plan_billing_cycle` is now `'monthly'`, all three pending columns null. Check the Mollie dashboard: the subscription's interval/amount should now reflect Pro-monthly.

- [ ] **Step 6: Update the QA matrix doc and HANDOFF.md**

Log the results in `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md`'s Results log, following the same format as the other 2026-08-25 rows.

---

## Self-Review

**Spec coverage:**
- Unified immediate/deferred rule covering both tier and cycle → Task 1 (`resolvePlanChangeDirection`).
- Schema to carry a pending cycle → Task 2.
- Scheduling endpoint accepts and validates the new same-tier cycle case → Task 3.
- Cancel-pending clears the new column too → Task 4.
- Cron applies the pending cycle when it lands → Task 5.
- UI reuses the existing toggle, no new control → Task 7 (no new component, only tile-logic changes).
- No proration anywhere in the new code paths → Task 3/Task 5 never introduce a partial charge; immediate cycle-upgrades reuse the existing full-price checkout flow untouched.

**Placeholder scan:** none found — every step has concrete code or exact commands.

**Type consistency:** `isCycleDowngrade`/`isCycleUpgrade`/`isTierDowngrade` (Task 7) are new, distinctly-named booleans that don't collide with the pre-existing `isDowngrade` (kept as their union, for the disable/routing logic that doesn't need to distinguish the two). `pending_billing_cycle` (Task 2's column name) is referenced identically in Tasks 3, 4, 5, and 7.
