import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/admin/settings/platform-billing";

function cronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (cronSecret) return got === cronSecret;
  const allowed = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  ].filter(Boolean) as string[];
  return !!got && allowed.includes(got);
}

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    if (!cronAuthorized(request)) return json({ error: "unauthorized" }, 401);

    const nowIso = new Date().toISOString();
    const results = {
      pending_applied: [] as Array<{ shop_id: string; from: string; to: string }>,
      expired_to_starter: [] as Array<{ shop_id: string; from: string }>,
    };

    const { data: pendingShops, error: pendingErr } = await supabaseAdmin
      .from("shops")
      .select("id, plan, pending_plan, pending_plan_effective_at")
      .not("pending_plan", "is", null)
      .not("pending_plan_effective_at", "is", null)
      .lte("pending_plan_effective_at", nowIso);

    if (pendingErr) return json({ error: "fetch_failed", detail: pendingErr.message }, 500);

    for (const shop of pendingShops ?? []) {
      if (!shop.pending_plan) continue;
      const oldPlan = shop.plan;
      const { data: updated } = await supabaseAdmin
        .from("shops")
        .update({
          plan: shop.pending_plan,
          pending_plan: null,
          pending_plan_effective_at: null,
        })
        .eq("id", shop.id)
        .not("pending_plan", "is", null)
        .select("id")
        .maybeSingle();
      if (!updated) continue;
      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "subscription_plan_applied",
        shop_id: shop.id,
        metadata: { old_plan: oldPlan, new_plan: shop.pending_plan },
      });
      results.pending_applied.push({ shop_id: shop.id, from: oldPlan, to: shop.pending_plan });
    }

    const { data: expired, error: expErr } = await supabaseAdmin
      .from("shops")
      .select("id, plan, plan_expires_at, subscription_status, onboarding")
      .in("plan", ["starter", "pro", "premium"])
      .not("plan_expires_at", "is", null)
      .lt("plan_expires_at", nowIso);

    if (expErr) return json({ error: "fetch_failed", detail: expErr.message }, 500);

    for (const shop of expired ?? []) {
      const status = shop.subscription_status;
      if (status !== "cancelled" && status !== "payment_failed" && status !== "active" && status !== "expired") {
        if (status === "none") continue;
      }
      const onboarding = (shop.onboarding ?? {}) as Record<string, unknown>;
      const { error: updErr } = await supabaseAdmin
        .from("shops")
        .update({
          plan: "starter",
          subscription_status: "none",
          pending_plan: null,
          pending_plan_effective_at: null,
          plan_billing_cycle: null,
          plan_expires_at: null,
          onboarding: {
            ...onboarding,
            mollie_subscription_id: null,
          },
        })
        .eq("id", shop.id)
        .lt("plan_expires_at", nowIso);
      if (updErr) {
        console.error("[billing-expiry] update failed", shop.id, updErr);
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
