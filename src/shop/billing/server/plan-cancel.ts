// Cancel a platform Mollie subscription. The current plan stays active until
// shops.plan_expires_at — at that point the daily expire-sweep cron flips the
// shop back to 'trial' (already implemented) and onboarding.subscription_status
// → "expired". This endpoint marks the cancellation in onboarding so the UI
// can show "active until X, then trial" and skips the next renewal.
//
// Auth: bearer token, must be shop owner OR super_admin.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/admin/settings/platform-billing";
import { getMolliePlatformKeys, mollieFetchWithFallback } from "@/shared/lib/mollie-platform";

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
            .select("id, name, owner_id, plan, plan_expires_at, onboarding")
            .eq("id", body.shop_id)
            .maybeSingle();
          if (!shop) return json({ error: "shop_not_found" }, 404);

          // Authorize
          if (shop.owner_id !== userId) {
            const { data: roles } = await supabaseAdmin
              .from("user_roles").select("role").eq("user_id", userId);
            if (!(roles ?? []).some((r) => r.role === "super_admin")) {
              return json({ error: "forbidden" }, 403);
            }
          }

          if (shop.plan === "trial") {
            return json({ error: "no_active_subscription" }, 400);
          }

          const onboarding = ((shop.onboarding ?? {}) as Record<string, unknown>);
          const subId = onboarding.mollie_subscription_id as string | undefined;
          const customerId = onboarding.mollie_customer_id as string | undefined;
          const hasMollie = getMolliePlatformKeys().length > 0;

          let mollieCancelled = false;
          let mollieError: string | null = null;
          if (hasMollie && customerId && subId) {
            // Subscription was created on whichever key was active at the time —
            // the fallback helper transparently retries the legacy key on 401/404.
            const result = await mollieFetchWithFallback(
              `https://api.mollie.com/v2/customers/${customerId}/subscriptions/${subId}`,
              { method: "DELETE" },
            );
            if (result?.response.ok) {
              mollieCancelled = true;
            } else if (result) {
              mollieError = await result.response.text();
              console.error("[billing/plan-cancel] mollie delete failed:", mollieError);
            }
          }

          const cancelledAt = new Date().toISOString();
          await supabaseAdmin
            .from("shops")
            .update({
              onboarding: {
                ...onboarding,
                subscription_status: "cancelled",
                subscription_cancelled_at: cancelledAt,
              },
            })
            .eq("id", shop.id);

          await supabaseAdmin.from("activity_log").insert({
            entity: BILLING_ENTITY,
            action: "subscription_cancelled",
            shop_id: shop.id,
            actor_user_id: userId,
            actor_email: userRes.user.email ?? null,
            metadata: {
              plan: shop.plan,
              expires_at: shop.plan_expires_at,
              mollie_subscription_id: subId ?? null,
              mollie_cancelled: mollieCancelled,
              mollie_error: mollieError,
            },
          });

          await supabaseAdmin.from("notifications").insert({
            shop_id: shop.id,
            type: "billing",
            title: "Abonnement opgezegd",
            message: shop.plan_expires_at
              ? `Je abonnement loopt nog tot ${new Date(shop.plan_expires_at).toLocaleDateString("nl-NL")}, daarna stopt het automatisch.`
              : "Je abonnement is opgezegd.",
            action_url: "/shop/settings",
            metadata: { kind: "subscription", subkind: "cancelled" },
          });

          return json({ ok: true, mollie_cancelled: mollieCancelled, expires_at: shop.plan_expires_at });
        } catch (err) {
          console.error("[billing/plan-cancel] error:", err);
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
