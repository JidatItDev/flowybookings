// Daily cron: finalize cancelled subscriptions whose paid period has ended.
//
// Finds shops where onboarding.subscription_status = 'cancelled' AND
// plan_expires_at < now(), then:
//   - plan -> 'trial'
//   - plan_expires_at -> null
//   - onboarding.subscription_status -> 'expired'
//   - logs to activity_log
//   - inserts a billing notification for the owner
//
// Auth: Bearer token must match SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_ANON_KEY, or SUPABASE_PUBLISHABLE_KEY.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/lib/platform-billing";

export const Route = createFileRoute("/hooks/expire-cancelled-subscriptions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        const allowed = [
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          process.env.SUPABASE_ANON_KEY,
          process.env.SUPABASE_PUBLISHABLE_KEY,
        ].filter(Boolean) as string[];

        if (!token || !allowed.includes(token)) {
          return json({ error: "unauthorized" }, 401);
        }

        const nowIso = new Date().toISOString();

        // Find cancelled shops past their paid period
        const { data: candidates, error: fetchErr } = await supabaseAdmin
          .from("shops")
          .select("id, name, owner_id, plan, plan_expires_at, plan_billing_cycle, onboarding")
          .not("plan_expires_at", "is", null)
          .lt("plan_expires_at", nowIso);

        if (fetchErr) {
          console.error("[expire-cancelled] fetch error", fetchErr);
          return json({ error: "fetch_failed", detail: fetchErr.message }, 500);
        }

        const shops = (candidates ?? []).filter((s) => {
          const ob = (s.onboarding ?? {}) as Record<string, unknown>;
          return ob.subscription_status === "cancelled";
        });

        const results: Array<{ shop_id: string; previous_plan: string }> = [];

        for (const shop of shops) {
          const previousOnboarding = (shop.onboarding ?? {}) as Record<string, unknown>;
          const newOnboarding = {
            ...previousOnboarding,
            subscription_status: "expired",
            cancelled_finalized_at: nowIso,
          };

          const { error: updErr } = await supabaseAdmin
            .from("shops")
            .update({
              plan: "trial",
              plan_billing_cycle: null,
              plan_expires_at: null,
              onboarding: newOnboarding,
            })
            .eq("id", shop.id);

          if (updErr) {
            console.error("[expire-cancelled] update failed", shop.id, updErr);
            continue;
          }

          await supabaseAdmin.from("activity_log").insert({
            entity: BILLING_ENTITY,
            action: "subscription_finalized_expired",
            shop_id: shop.id,
            metadata: {
              previous_plan: shop.plan,
              previous_expires_at: shop.plan_expires_at,
              previous_cycle: shop.plan_billing_cycle,
              new_plan: "trial",
              new_subscription_status: "expired",
              swept_at: nowIso,
            },
          });

          await supabaseAdmin.from("notifications").insert({
            shop_id: shop.id,
            type: "billing",
            title: "Abonnement beëindigd",
            message: `Je opgezegde ${String(shop.plan).toUpperCase()} abonnement is afgelopen. Kies een nieuw plan om weer boekingen te ontvangen.`,
            action_url: "/shop/billing",
            metadata: { kind: "subscription", subkind: "cancelled_finalized", previous_plan: shop.plan },
          });

          results.push({ shop_id: shop.id, previous_plan: shop.plan });
        }

        return json({
          ok: true,
          checked: shops.length,
          finalized: results.length,
          results,
          ran_at: nowIso,
        });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
