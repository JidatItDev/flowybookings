// Schedule a platform-plan downgrade at period end. Local plan stays until
// pending_plan_effective_at; Mollie subscription is PATCHed now so the next
// charge uses the lower amount. Orphan Mollie subscriptions are cancelled first.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY, type BillingCycle } from "@/admin/settings/platform-billing";
import { fetchPlanPriceCents } from "@/shop/billing/server/plan-price";
import { getMolliePlatformKeys } from "@/shared/lib/mollie-platform";
import type { DbPlan } from "@/shared/lib/plans";
import { enqueueSubscriptionEmail } from "@/email/enqueue-subscription-email";
import { ensureSinglePlatformSubscription } from "@/shop/billing/server/mollie-subscriptions";
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
        .select("id, name, owner_id, plan, plan_expires_at, plan_billing_cycle, mollie_customer_id, mollie_subscription_id")
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

      const subId = shop.mollie_subscription_id ?? null;
      const customerId = shop.mollie_customer_id ?? null;
      const hasMollie = getMolliePlatformKeys().length > 0;
      const amount = await fetchPlanPriceCents(targetPlan, cycle);

      let molliePatched = false;
      let mollieSubscriptionId = subId;
      let cancelledOrphans: string[] = [];
      if (hasMollie) {
        if (!customerId) {
          return json({ error: "mollie_customer_missing" }, 409);
        }
        const synced = await ensureSinglePlatformSubscription({
          customerId,
          shopId: shop.id,
          plan: targetPlan,
          cycle,
          amountValue: (amount / 100).toFixed(2),
          preferredSubId: subId,
        });
        if (!synced) {
          return json({ error: "mollie_subscription_sync_failed" }, 502);
        }
        molliePatched = true;
        mollieSubscriptionId = synced.subscriptionId;
        cancelledOrphans = synced.cancelled;
        if (synced.subscriptionId !== subId || cancelledOrphans.length) {
          await supabaseAdmin
            .from("shops")
            .update({
              mollie_subscription_id: synced.subscriptionId,
              ...(synced.nextPaymentDate ? { next_billing_at: synced.nextPaymentDate } : {}),
            })
            .eq("id", shop.id);
        } else if (synced.nextPaymentDate) {
          await supabaseAdmin
            .from("shops")
            .update({ next_billing_at: synced.nextPaymentDate })
            .eq("id", shop.id);
        }
      }

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
          mollie_patched: molliePatched,
          mollie_subscription_id: mollieSubscriptionId,
          mollie_orphans_cancelled: cancelledOrphans,
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
        mollie_subscription_id: mollieSubscriptionId,
      });

      return json({
        ok: true,
        pending_plan: targetPlan,
        pending_plan_effective_at: effectiveAt,
        mollie_patched: molliePatched,
        mollie_subscription_id: mollieSubscriptionId,
        mollie_orphans_cancelled: cancelledOrphans,
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
