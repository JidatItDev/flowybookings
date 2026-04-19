// Daily expiry sweep: finds shops past plan_expires_at on a paid plan,
// downgrades them to 'starter', logs to activity_log, and notifies the owner.
//
// Auth: requires Authorization: Bearer <token> matching either:
//   - SUPABASE_SERVICE_ROLE_KEY (for trusted server-side cron)
//   - SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY (for pg_cron via net.http_post)
// Triggered by pg_cron once per day. Idempotent: re-runs are safe.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/lib/platform-billing";

const PAID_PLANS = ["pro", "premium"] as const;

export const Route = createFileRoute("/api/billing/expire-sweep")({
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

        const { data: expired, error: fetchErr } = await supabaseAdmin
          .from("shops")
          .select("id, name, owner_id, plan, plan_expires_at, plan_billing_cycle")
          .in("plan", [...PAID_PLANS])
          .not("plan_expires_at", "is", null)
          .lt("plan_expires_at", nowIso);

        if (fetchErr) {
          console.error("[expire-sweep] fetch error", fetchErr);
          return json({ error: "fetch_failed", detail: fetchErr.message }, 500);
        }

        const shops = expired ?? [];
        const results: Array<{ shop_id: string; previous_plan: string }> = [];

        for (const shop of shops) {
          const { error: updErr } = await supabaseAdmin
            .from("shops")
            .update({
              plan: "starter",
              plan_billing_cycle: null,
              plan_expires_at: null,
            })
            .eq("id", shop.id);

          if (updErr) {
            console.error("[expire-sweep] downgrade failed", shop.id, updErr);
            continue;
          }

          await supabaseAdmin.from("activity_log").insert({
            entity: BILLING_ENTITY,
            action: "plan_auto_downgraded",
            shop_id: shop.id,
            metadata: {
              previous_plan: shop.plan,
              previous_expires_at: shop.plan_expires_at,
              previous_cycle: shop.plan_billing_cycle,
              new_plan: "starter",
              swept_at: nowIso,
            },
          });

          await supabaseAdmin.from("notifications").insert({
            shop_id: shop.id,
            type: "billing",
            title: "Plan expired — downgraded to Starter",
            message: `Your ${shop.plan.toUpperCase()} plan expired and was downgraded to Starter. Renew anytime to restore your features.`,
            action_url: "/shop/upgrade",
          });

          results.push({ shop_id: shop.id, previous_plan: shop.plan });
        }

        return json({
          ok: true,
          checked: shops.length,
          downgraded: results.length,
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
