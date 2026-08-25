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
        .update({ pending_plan: null, pending_plan_effective_at: null, pending_billing_cycle: null })
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
