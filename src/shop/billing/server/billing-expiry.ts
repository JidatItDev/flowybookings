import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/admin/settings/platform-billing";
import { serverEnv } from "@/server/env";

function cronAuthorized(request: Request): boolean {
  const cronSecret = serverEnv("CRON_SECRET");
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (cronSecret) return got === cronSecret;
  const allowed = [
    serverEnv("SUPABASE_SERVICE_ROLE_KEY"),
    serverEnv("SUPABASE_ANON_KEY"),
    serverEnv("SUPABASE_PUBLISHABLE_KEY"),
  ].filter(Boolean) as string[];
  return !!got && allowed.includes(got);
}

function hasLiveMollieSubscription(onboarding: Record<string, unknown> | null | undefined): boolean {
  const id = onboarding?.mollie_subscription_id;
  return typeof id === "string" && id.length > 0;
}

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
      .select("id, plan, pending_plan, pending_plan_effective_at, onboarding, subscription_status")
      .not("pending_plan", "is", null)
      .not("pending_plan_effective_at", "is", null)
      .lte("pending_plan_effective_at", nowIso);

    if (pendingErr) return json({ error: "fetch_failed", detail: pendingErr.message }, 500);

    for (const shop of pendingShops ?? []) {
      if (!shop.pending_plan) continue;
      const oldPlan = shop.plan;
      const onboarding = (shop.onboarding ?? {}) as Record<string, unknown>;
      const keepActive = hasLiveMollieSubscription(onboarding) || shop.subscription_status === "active";
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

    // 2) Expire lapsed paid/cancelled shops — but never while Mollie still has a
    // live subscription (e.g. SEPA awaiting collection) or a future next_billing_at.
    const { data: expired, error: expErr } = await supabaseAdmin
      .from("shops")
      .select("id, plan, plan_expires_at, subscription_status, onboarding, next_billing_at")
      .in("plan", ["starter", "pro", "premium"])
      .not("plan_expires_at", "is", null)
      .lt("plan_expires_at", nowIso);

    if (expErr) return json({ error: "fetch_failed", detail: expErr.message }, 500);

    for (const shop of expired ?? []) {
      if (pendingAppliedIds.has(shop.id)) continue;
      const onboarding = (shop.onboarding ?? {}) as Record<string, unknown>;
      const nextBilling = shop.next_billing_at ? new Date(shop.next_billing_at).getTime() : 0;
      if (hasLiveMollieSubscription(onboarding) || nextBilling > Date.now()) {
        results.skipped_live_mollie.push({ shop_id: shop.id });
        continue;
      }
      const status = shop.subscription_status;
      if (status !== "cancelled" && status !== "payment_failed" && status !== "active" && status !== "expired") {
        if (status === "none") continue;
      }
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
