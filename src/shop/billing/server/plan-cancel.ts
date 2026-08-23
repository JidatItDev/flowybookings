// Cancel a platform Mollie subscription. The current plan stays active until
// shops.plan_expires_at — then the billing-expiry job lands the shop on Starter.
// This endpoint sets shops.subscription_status = cancelled and clears pending
// plan changes so the UI can show "active until X".
//
// Auth: bearer token, must be shop owner OR super_admin.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/admin/settings/platform-billing";
import { getMolliePlatformKeys } from "@/shared/lib/mollie-platform";
import { enqueueSubscriptionEmail } from "@/email/enqueue-subscription-email";
import { cancelMollieSubscription } from "@/shop/billing/server/mollie-subscriptions";
import { resolveCancelOutcome } from "@/shop/billing/server/cancel-outcome";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.cancel");

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
            .select("id, name, owner_id, plan, plan_expires_at, subscription_status, mollie_customer_id, mollie_subscription_id")
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

          // Already cancelled — true no-op, don't re-send the email or re-log.
          if (shop.subscription_status === "cancelled") {
            return json({ ok: true, already_cancelled: true, expires_at: shop.plan_expires_at });
          }

          if (shop.plan === "trial") {
            return json({ error: "no_active_subscription" }, 400);
          }

          const subId = shop.mollie_subscription_id ?? null;
          const customerId = shop.mollie_customer_id ?? null;
          const hasMollie = getMolliePlatformKeys().length > 0;

          // Subscription was created on whichever key was active at the time —
          // the fallback helper transparently retries the legacy key on 401/404.
          const mollieResult =
            hasMollie && customerId && subId
              ? await cancelMollieSubscription(customerId, subId)
              : null;
          const outcome = resolveCancelOutcome({ hasMollie, customerId, subId, mollieResult });

          if (outcome.kind === "fail") {
            // Fail closed: never mark the shop cancelled locally while Mollie
            // still has a live subscription — that would strand it billing
            // forever with no local trail. Leave state untouched; the DELETE
            // call is idempotent, so retrying the button is always safe.
            log.error("mollie_cancel_failed", { shop_id: shop.id, details: outcome.error });
            await supabaseAdmin.from("activity_log").insert({
              entity: BILLING_ENTITY,
              action: "subscription_cancel_failed",
              shop_id: shop.id,
              actor_user_id: userId,
              actor_email: userRes.user.email ?? null,
              metadata: {
                plan: shop.plan,
                mollie_customer_id: customerId,
                mollie_subscription_id: subId,
                mollie_error: outcome.error,
              },
            });
            return json({ error: "mollie_cancel_failed", details: outcome.error }, 502);
          }

          const mollieCancelled = outcome.mollieCancelled;
          const cancelledAt = new Date().toISOString();
          await supabaseAdmin
            .from("shops")
            .update({
              subscription_status: "cancelled",
              pending_plan: null,
              pending_plan_effective_at: null,
              next_billing_at: null,
              mollie_subscription_id: null,
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
            },
          });

          await supabaseAdmin.from("notifications").insert({
            shop_id: shop.id,
            type: "billing",
            title: "Abonnement opgezegd",
            message: shop.plan_expires_at
              ? `Je abonnement loopt nog tot ${new Date(shop.plan_expires_at).toLocaleDateString("nl-NL")}, daarna stopt het automatisch.`
              : "Je abonnement is opgezegd.",
            action_url: "/shop/billing",
            metadata: { kind: "subscription", subkind: "cancelled" },
          });

          await enqueueSubscriptionEmail({
            type: "subscription_cancelled",
            shopId: shop.id,
            idempotencyKey: `subscription_cancelled:${shop.id}:${cancelledAt}`,
            data: {
              plan: String(shop.plan),
              expiresAt: shop.plan_expires_at
                ? new Date(shop.plan_expires_at).toLocaleDateString("nl-NL")
                : "—",
            },
          });

          log.info("subscription_cancelled", {
            shop_id: shop.id,
            plan: shop.plan,
            expires_at: shop.plan_expires_at,
            mollie_cancelled: mollieCancelled,
          });

          return json({ ok: true, mollie_cancelled: mollieCancelled, expires_at: shop.plan_expires_at });
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
