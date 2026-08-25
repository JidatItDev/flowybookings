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
