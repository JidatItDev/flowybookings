// Platform subscription checkout — FlowyBookings' OWN Mollie account, not Connect.
// Missing keys return 503 server_configuration_missing (no mock checkout).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLATFORM_PROVIDER, BILLING_ENTITY, priceFor, type BillingCycle } from "@/admin/settings/platform-billing";
import {
  getMolliePrimaryKey,
  mollieAuthHeader,
  mollieFetchWithFallback,
  MOLLIE_CONFIG_MISSING,
  platformMollieWebhookFields,
} from "@/shared/lib/mollie-platform";
import type { DbPlan } from "@/shared/lib/plans";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.checkout");

const ALLOWED_PLANS = new Set(["starter", "pro", "premium"]);
const ALLOWED_CYCLES = new Set(["monthly", "yearly"]);
const PLAN_RANK: Record<string, number> = { trial: 0, starter: 1, pro: 2, premium: 3 };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handlers = {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }: { request: Request }) => {
        try {
          const body = (await request.json().catch(() => null)) as
            | { shop_id?: string; plan?: string; cycle?: string; redirect_origin?: string }
            | null;

          if (!body?.shop_id || !body.plan || !ALLOWED_PLANS.has(body.plan)) {
            return json({ error: "invalid_input" }, 400);
          }
          const cycle: BillingCycle = ALLOWED_CYCLES.has(body.cycle ?? "")
            ? (body.cycle as BillingCycle)
            : "monthly";

          // Verify the caller is authenticated and owns the shop (RLS-style check via service role).
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!token) return json({ error: "unauthenticated" }, 401);

          const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
          const userId = userRes.user.id;

          const { data: shop, error: shopErr } = await supabaseAdmin
            .from("shops")
            .select("id, name, owner_id, plan, plan_billing_cycle, mollie_customer_id")
            .eq("id", body.shop_id)
            .maybeSingle();
          if (shopErr || !shop) return json({ error: "shop_not_found" }, 404);
          if (shop.owner_id !== userId) {
            // Allow super_admin too
            const { data: roles } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", userId);
            const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
            if (!isAdmin) return json({ error: "forbidden" }, 403);
          }

          const plan = body.plan as Exclude<DbPlan, "trial">;
          const previousPlan = shop.plan as DbPlan;
          const isUpgrade =
            previousPlan !== "trial" && (PLAN_RANK[plan] ?? 0) > (PLAN_RANK[previousPlan] ?? 0);
          const paymentKind = isUpgrade ? "subscription_upgrade" : "subscription_first";
          const amount = priceFor(plan, cycle);
          const origin = body.redirect_origin || new URL(request.url).origin;

          // 1) Pre-create a pending payment row so we can correlate the webhook.
          const { data: payment, error: payErr } = await supabaseAdmin
            .from("payments")
            .insert({
              shop_id: shop.id,
              booking_id: null,
              amount_cents: amount,
              currency: "EUR",
              status: "unpaid",
              provider: PLATFORM_PROVIDER,
              metadata: {
                plan,
                cycle,
                kind: paymentKind,
                previous_plan: shop.plan,
                initiated_by: userId,
              },
            })
            .select("id")
            .single();
          if (payErr || !payment) {
            return json({ error: "could_not_create_payment", details: payErr?.message }, 500);
          }

          // Recurring: ensure a Mollie Customer, then a sequenceType:first payment.
          const mollieKey = getMolliePrimaryKey();
          if (!mollieKey) {
            await supabaseAdmin
              .from("payments")
              .update({
                status: "failed",
                metadata: { error: MOLLIE_CONFIG_MISSING, plan, cycle },
              })
              .eq("id", payment.id);
            return json({
              error: MOLLIE_CONFIG_MISSING,
              details: "Server configuration missing",
            }, 503);
          }

          let checkoutUrl: string;
          let mollieId: string | null = null;
          let mollieCustomerId = shop.mollie_customer_id ?? null;

          if (!mollieCustomerId) {
            const custRes = await fetch("https://api.mollie.com/v2/customers", {
              method: "POST",
              headers: { Authorization: mollieAuthHeader(mollieKey), "Content-Type": "application/json" },
              body: JSON.stringify({
                name: shop.name,
                email: userRes.user.email ?? undefined,
                metadata: { shop_id: shop.id },
              }),
            });
            if (custRes.ok) {
              const cust = (await custRes.json()) as { id: string };
              mollieCustomerId = cust.id;
              await supabaseAdmin
                .from("shops")
                .update({ mollie_customer_id: mollieCustomerId })
                .eq("id", shop.id);
              log.info("mollie_customer_created", { shop_id: shop.id, mollie_customer_id: mollieCustomerId });
            } else {
              const errText = await custRes.text();
              log.error("mollie_customer_failed", { shop_id: shop.id, details: errText });
              await supabaseAdmin.from("payments").update({ status: "failed", metadata: { mollie_error: errText, plan, cycle } }).eq("id", payment.id);
              return json({ error: "mollie_customer_failed", details: errText }, 502);
            }
          }

          const { data: billingCfg } = await supabaseAdmin
            .from("platform_billing_config")
            .select("webhook_url_override")
            .eq("id", 1)
            .maybeSingle();

          const fallback = await mollieFetchWithFallback(
            `https://api.mollie.com/v2/customers/${mollieCustomerId}/payments`,
            {
              method: "POST",
              body: JSON.stringify({
                amount: { currency: "EUR", value: (amount / 100).toFixed(2) },
                description: `FlowyBookings ${plan.toUpperCase()} abonnement — ${shop.name}`,
                redirectUrl: `${origin}/shop/billing?billing=success&payment=${payment.id}`,
                ...platformMollieWebhookFields(origin, billingCfg?.webhook_url_override),
                sequenceType: "first",
                metadata: { payment_id: payment.id, shop_id: shop.id, plan, cycle, kind: paymentKind, mollie_customer_id: mollieCustomerId },
              }),
            },
          );
          const mollieRes = fallback?.response;
          if (!mollieRes || !mollieRes.ok) {
            const errText = mollieRes ? await mollieRes.text() : "no_mollie_response";
            await supabaseAdmin
              .from("payments")
              .update({ status: "failed", metadata: { mollie_error: errText, plan, cycle } })
              .eq("id", payment.id);
            return json({ error: "mollie_create_failed", details: errText }, 502);
          }
          const mollie = (await mollieRes.json()) as {
            id: string;
            _links?: { checkout?: { href?: string } };
          };
          mollieId = mollie.id;
          checkoutUrl = mollie._links?.checkout?.href ?? `${origin}/shop/billing?billing=success&payment=${payment.id}`;
          await supabaseAdmin
            .from("payments")
            .update({ provider_payment_id: mollie.id })
            .eq("id", payment.id);

          log.info("checkout_created", {
            shop_id: shop.id,
            payment_id: payment.id,
            mollie_id: mollieId,
            plan,
            cycle,
            kind: paymentKind,
            amount_cents: amount,
          });

          await supabaseAdmin.from("activity_log").insert({
            entity: BILLING_ENTITY,
            action: "checkout_created",
            shop_id: shop.id,
            actor_user_id: userId,
            actor_email: userRes.user.email ?? null,
            metadata: { payment_id: payment.id, mollie_id: mollieId, plan, cycle, amount_cents: amount },
          });

          return json({ ok: true, payment_id: payment.id, checkout_url: checkoutUrl });
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
