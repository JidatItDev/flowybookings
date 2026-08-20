// SMS credit top-up checkout — creates a one-off Mollie payment that, once paid,
// adds credits to the shop's shop_sms_credits balance via the Mollie webhook.
//
// Uses the platform Mollie account. Missing keys return 503 (no mock checkout).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLATFORM_PROVIDER } from "@/admin/settings/platform-billing";
import {
  getMolliePrimaryKey,
  mollieAuthHeader,
  MOLLIE_CONFIG_MISSING,
  platformMollieWebhookFields,
} from "@/shared/lib/mollie-platform";
import { getSmsPackage } from "@/shop/notifications/sms-packages";

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
            | { shop_id?: string; package?: string; redirect_origin?: string }
            | null;

          if (!body?.shop_id || !body.package) {
            return json({ error: "invalid_input" }, 400);
          }
          const pkg = getSmsPackage(body.package);
          if (!pkg) return json({ error: "unknown_package" }, 400);

          // Auth: caller must be authenticated and own the shop (or super_admin).
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!token) return json({ error: "unauthenticated" }, 401);

          const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
          const userId = userRes.user.id;

          const { data: shop, error: shopErr } = await supabaseAdmin
            .from("shops")
            .select("id, name, owner_id")
            .eq("id", body.shop_id)
            .maybeSingle();
          if (shopErr || !shop) return json({ error: "shop_not_found" }, 404);
          if (shop.owner_id !== userId) {
            const { data: roles } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", userId);
            const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
            if (!isAdmin) return json({ error: "forbidden" }, 403);
          }

          const origin = body.redirect_origin || new URL(request.url).origin;

          // 1) Pre-create pending payment row (kind: "sms_credits") so webhook can correlate.
          const { data: payment, error: payErr } = await supabaseAdmin
            .from("payments")
            .insert({
              shop_id: shop.id,
              booking_id: null,
              amount_cents: pkg.amountCents,
              currency: "EUR",
              status: "unpaid",
              provider: PLATFORM_PROVIDER,
              metadata: {
                kind: "sms_credits",
                package: pkg.id,
                credits: pkg.credits,
                initiated_by: userId,
              },
            })
            .select("id")
            .single();
          if (payErr || !payment) {
            return json({ error: "could_not_create_payment", details: payErr?.message }, 500);
          }

          const mollieKey = getMolliePrimaryKey();
          if (!mollieKey) {
            await supabaseAdmin
              .from("payments")
              .update({
                status: "failed",
                metadata: { error: MOLLIE_CONFIG_MISSING, kind: "sms_credits", package: pkg.id },
              })
              .eq("id", payment.id);
            return json({
              error: MOLLIE_CONFIG_MISSING,
              details: "Server configuration missing",
            }, 503);
          }

          const { data: billingCfg } = await supabaseAdmin
            .from("platform_billing_config")
            .select("webhook_url_override")
            .eq("id", 1)
            .maybeSingle();

          const mollieRes = await fetch("https://api.mollie.com/v2/payments", {
              method: "POST",
              headers: {
                Authorization: mollieAuthHeader(mollieKey),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                amount: { currency: "EUR", value: (pkg.amountCents / 100).toFixed(2) },
                description: `FlowyBookings SMS-tegoed — ${pkg.credits} credits`,
                redirectUrl: `${origin}/shop/notifications?topup=return&payment=${payment.id}`,
                ...platformMollieWebhookFields(origin, billingCfg?.webhook_url_override),
                metadata: {
                  payment_id: payment.id,
                  shop_id: shop.id,
                  kind: "sms_credits",
                  package: pkg.id,
                  credits: pkg.credits,
                },
              }),
            });
            if (!mollieRes.ok) {
              const errText = await mollieRes.text();
              await supabaseAdmin
                .from("payments")
                .update({ status: "failed", metadata: { mollie_error: errText, kind: "sms_credits", package: pkg.id, credits: pkg.credits } })
                .eq("id", payment.id);
              return json({ error: "mollie_create_failed", details: errText }, 502);
            }
            const mollie = (await mollieRes.json()) as {
              id: string;
              _links?: { checkout?: { href?: string } };
            };
            const mollieId = mollie.id;
            const checkoutUrl =
              mollie._links?.checkout?.href ??
              `${origin}/shop/notifications?topup=return&payment=${payment.id}`;
            await supabaseAdmin
              .from("payments")
              .update({ provider_payment_id: mollie.id })
              .eq("id", payment.id);

          await supabaseAdmin.from("activity_log").insert({
            entity: "sms_credits",
            action: "topup_created",
            shop_id: shop.id,
            actor_user_id: userId,
            actor_email: userRes.user.email ?? null,
            metadata: { payment_id: payment.id, mollie_id: mollieId, package: pkg.id, credits: pkg.credits, amount_cents: pkg.amountCents },
          });

          return json({ ok: true, payment_id: payment.id, checkout_url: checkoutUrl });
        } catch (err) {
          console.error("[sms-credits/checkout] error:", err);
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
