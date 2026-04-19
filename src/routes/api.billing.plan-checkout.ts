// Platform subscription checkout — creates a Mollie payment for a plan upgrade.
// Calls FlowyBookings' OWN Mollie account (MOLLIE_API_KEY), NOT the shop's connected account.
//
// When MOLLIE_API_KEY is not configured (development), we fall back to "mock mode":
// we still insert a `payments` row marked as pending so the lifecycle is testable,
// and return a fake checkout URL that points back to /shop/upgrade?billing=mock.
//
// Security: requires a valid Supabase session and that the caller owns the shop.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLATFORM_PROVIDER, BILLING_ENTITY, priceFor, type BillingCycle } from "@/lib/platform-billing";
import type { DbPlan } from "@/lib/plans";

const ALLOWED_PLANS = new Set(["starter", "pro", "premium"]);
const ALLOWED_CYCLES = new Set(["monthly", "yearly"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/billing/plan-checkout")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
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
            .select("id, name, owner_id, plan")
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
                kind: "subscription",
                previous_plan: shop.plan,
                initiated_by: userId,
              },
            })
            .select("id")
            .single();
          if (payErr || !payment) {
            return json({ error: "could_not_create_payment", details: payErr?.message }, 500);
          }

          // 2) Try to create a real Mollie payment. If no key, return a mock URL.
          const mollieKey = process.env.MOLLIE_API_KEY;
          let checkoutUrl: string;
          let mollieId: string | null = null;
          let mocked = false;

          if (mollieKey) {
            const mollieRes = await fetch("https://api.mollie.com/v2/payments", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${mollieKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                amount: { currency: "EUR", value: (amount / 100).toFixed(2) },
                description: `FlowyBookings ${plan.toUpperCase()} (${cycle}) — ${shop.name}`,
                redirectUrl: `${origin}/shop/upgrade?billing=return&payment=${payment.id}`,
                webhookUrl: `${origin}/api/mollie/webhook`,
                metadata: { payment_id: payment.id, shop_id: shop.id, plan, cycle, kind: "subscription" },
              }),
            });
            if (!mollieRes.ok) {
              const errText = await mollieRes.text();
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
            checkoutUrl = mollie._links?.checkout?.href ?? `${origin}/shop/upgrade?billing=return&payment=${payment.id}`;
            await supabaseAdmin
              .from("payments")
              .update({ provider_payment_id: mollie.id })
              .eq("id", payment.id);
          } else {
            mocked = true;
            checkoutUrl = `${origin}/shop/upgrade?billing=mock&payment=${payment.id}`;
          }

          // 3) Audit log
          await supabaseAdmin.from("activity_log").insert({
            entity: BILLING_ENTITY,
            action: mocked ? "checkout_mock_created" : "checkout_created",
            shop_id: shop.id,
            actor_user_id: userId,
            actor_email: userRes.user.email ?? null,
            metadata: { payment_id: payment.id, mollie_id: mollieId, plan, cycle, amount_cents: amount },
          });

          return json({ ok: true, payment_id: payment.id, checkout_url: checkoutUrl, mocked });
        } catch (err) {
          console.error("[billing/plan-checkout] error:", err);
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
