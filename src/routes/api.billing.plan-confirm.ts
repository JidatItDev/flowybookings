// Manual confirm endpoint — used by mock mode (no MOLLIE_API_KEY) for end-to-end testing.
// Also usable by hidden admins to force a plan-payment to "paid" without a webhook.
// Re-uses the same lifecycle path as the webhook by directly updating the payment + shop.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY, PLATFORM_PROVIDER, nextExpiry, type BillingCycle } from "@/lib/platform-billing";
import type { DbPlan } from "@/lib/plans";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/billing/plan-confirm")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as
            | { payment_id?: string; outcome?: "paid" | "failed" }
            | null;
          if (!body?.payment_id) return json({ error: "missing_payment_id" }, 400);
          const outcome = body.outcome === "failed" ? "failed" : "paid";

          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!token) return json({ error: "unauthenticated" }, 401);
          const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
          const userId = userRes.user.id;

          const { data: payment } = await supabaseAdmin
            .from("payments")
            .select("id, shop_id, provider, booking_id, metadata, status")
            .eq("id", body.payment_id)
            .maybeSingle();
          if (!payment) return json({ error: "payment_not_found" }, 404);
          if (payment.provider !== PLATFORM_PROVIDER || payment.booking_id !== null) {
            return json({ error: "not_a_subscription_payment" }, 400);
          }

          // Authorize: shop owner OR super_admin
          const { data: shop } = await supabaseAdmin
            .from("shops")
            .select("owner_id, plan")
            .eq("id", payment.shop_id)
            .maybeSingle();
          const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);
          const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
          if (!shop || (shop.owner_id !== userId && !isAdmin)) return json({ error: "forbidden" }, 403);

          // Mark payment final.
          await supabaseAdmin
            .from("payments")
            .update({ status: outcome === "paid" ? "paid" : "failed", updated_at: new Date().toISOString() })
            .eq("id", payment.id);

          const meta = (payment.metadata ?? {}) as Record<string, unknown>;
          const plan = meta.plan as DbPlan | undefined;
          const cycle = (meta.cycle as BillingCycle | undefined) ?? "monthly";

          if (outcome === "paid" && plan && ["starter", "pro", "premium"].includes(plan)) {
            const expiry = nextExpiry(new Date(), cycle).toISOString();
            await supabaseAdmin
              .from("shops")
              .update({ plan, plan_expires_at: expiry, plan_billing_cycle: cycle })
              .eq("id", payment.shop_id);

            await supabaseAdmin.from("activity_log").insert({
              entity: BILLING_ENTITY,
              action: "subscription_activated",
              shop_id: payment.shop_id,
              actor_user_id: userId,
              actor_email: userRes.user.email ?? null,
              metadata: {
                payment_id: payment.id,
                plan,
                cycle,
                previous_plan: shop.plan,
                new_expires_at: expiry,
                source: "manual_confirm",
              },
            });

            await supabaseAdmin.from("notifications").insert({
              shop_id: payment.shop_id,
              type: "billing",
              title: `Plan activated: ${String(plan).toUpperCase()}`,
              message: `Your subscription is active until ${new Date(expiry).toLocaleDateString()}.`,
              action_url: "/shop/upgrade",
            });
          } else if (outcome === "failed") {
            await supabaseAdmin.from("activity_log").insert({
              entity: BILLING_ENTITY,
              action: "subscription_payment_failed",
              shop_id: payment.shop_id,
              actor_user_id: userId,
              actor_email: userRes.user.email ?? null,
              metadata: { payment_id: payment.id, plan, cycle, source: "manual_confirm" },
            });
          }

          return json({ ok: true });
        } catch (err) {
          console.error("[billing/plan-confirm] error:", err);
          return json({ error: "internal_error", details: (err as Error).message }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
