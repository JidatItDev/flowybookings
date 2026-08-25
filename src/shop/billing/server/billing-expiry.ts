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

const log = createLogger("billing.expiry");

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    if (!cronAuthorized(request)) return json({ error: "unauthorized" }, 401);

    const nowIso = new Date().toISOString();
    const results = {
      pending_applied: [] as Array<{ shop_id: string; from: string; to: string }>,
      expired_to_starter: [] as Array<{ shop_id: string; from: string }>,
      skipped_live_mollie: [] as Array<{ shop_id: string }>,
    };
    const pendingAppliedIds = new Set<string>();

    // 1) Apply scheduled plan changes (downgrades). Do NOT invent plan_expires_at —
    // paid-through only advances when Mollie reports a paid charge.
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

    // 2) Expire lapsed paid/cancelled shops — but never while Mollie still has a
    // live subscription (e.g. SEPA awaiting collection) or a future next_billing_at.
    const { data: expired, error: expErr } = await supabaseAdmin
      .from("shops")
      .select("id, plan, plan_expires_at, subscription_status, mollie_subscription_id, next_billing_at")
      .in("plan", ["starter", "pro", "premium"])
      .not("plan_expires_at", "is", null)
      .lt("plan_expires_at", nowIso);

    if (expErr) return json({ error: "fetch_failed", detail: expErr.message }, 500);

    for (const shop of expired ?? []) {
      if (pendingAppliedIds.has(shop.id)) continue;
      const action = resolveExpirySweepAction(shop);
      if (action === "skip_live_mollie") {
        log.info("skipped_live_mollie", { shop_id: shop.id });
        results.skipped_live_mollie.push({ shop_id: shop.id });
        continue;
      }
      if (action === "skip_none") continue;
      const status = shop.subscription_status;
      const { error: updErr } = await supabaseAdmin
        .from("shops")
        .update({
          plan: "starter",
          subscription_status: "none",
          pending_plan: null,
          pending_plan_effective_at: null,
          plan_billing_cycle: null,
          plan_expires_at: null,
          next_billing_at: null,
          mollie_subscription_id: null,
        })
        .eq("id", shop.id)
        .lt("plan_expires_at", nowIso);
      if (updErr) {
        log.error("expire_update_failed", { shop_id: shop.id, err: updErr });
        continue;
      }
      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "subscription_expired_to_starter",
        shop_id: shop.id,
        metadata: { old_plan: shop.plan, previous_status: status },
      });
      await supabaseAdmin.from("notifications").insert({
        shop_id: shop.id,
        type: "billing",
        title: "Abonnement verlopen",
        message: "Je abonnement is afgelopen. Je zit nu op Starter.",
        action_url: "/shop/billing",
        metadata: { kind: "subscription", subkind: "expired_to_starter", previous_plan: shop.plan },
      });
      log.info("expired_to_starter", { shop_id: shop.id, from: shop.plan });
      results.expired_to_starter.push({ shop_id: shop.id, from: shop.plan });
    }

    return json({ ok: true, ran_at: nowIso, ...results });
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
