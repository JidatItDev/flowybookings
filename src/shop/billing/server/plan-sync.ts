// After Mollie redirect, fetch live payment status and apply the same
// lifecycle as the webhook. Webhooks are often delayed or blocked locally (ngrok).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLATFORM_PROVIDER } from "@/admin/settings/platform-billing";
import { processMolliePaymentNotification } from "@/shop/payments/server/mollie-webhook";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.sync");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

  POST: async ({ request }: { request: Request }) => {
    try {
      const body = (await request.json().catch(() => null)) as { payment_id?: string } | null;
      if (!body?.payment_id) return json({ error: "invalid_input" }, 400);

      const authHeader = request.headers.get("authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "unauthenticated" }, 401);

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
      const userId = userRes.user.id;

      const { data: payment, error: payErr } = await supabaseAdmin
        .from("payments")
        .select("id, shop_id, status, provider, provider_payment_id, booking_id")
        .eq("id", body.payment_id)
        .maybeSingle();
      if (payErr || !payment) return json({ error: "payment_not_found" }, 404);
      if (payment.provider !== PLATFORM_PROVIDER || payment.booking_id !== null) {
        return json({ error: "not_platform_payment" }, 400);
      }

      const { data: shop } = await supabaseAdmin
        .from("shops")
        .select("id, owner_id, plan")
        .eq("id", payment.shop_id)
        .maybeSingle();
      if (!shop) return json({ error: "shop_not_found" }, 404);
      if (shop.owner_id !== userId) {
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
        if (!isAdmin) return json({ error: "forbidden" }, 403);
      }

      if (payment.status === "paid") {
        log.info("return_sync_skipped_already_paid", {
          payment_id: payment.id,
          shop_id: payment.shop_id,
        });
        const { data: shopAfter } = await supabaseAdmin
          .from("shops")
          .select("plan, subscription_status, plan_expires_at")
          .eq("id", shop.id)
          .maybeSingle();
        return json({
          ok: true,
          local_status: "paid",
          mollie_status: "paid",
          plan: shopAfter?.plan ?? shop.plan,
          subscription_status: shopAfter?.subscription_status ?? null,
        });
      }

      if (!payment.provider_payment_id) {
        return json({ error: "missing_mollie_id", local_status: payment.status }, 409);
      }

      const applied = await processMolliePaymentNotification(
        payment.provider_payment_id,
        "return_sync",
      );

      log.info("return_sync_applied", {
        payment_id: payment.id,
        shop_id: payment.shop_id,
        local_status: applied.local_status,
        mollie_status: applied.mollie_status,
      });

      const { data: shopAfter } = await supabaseAdmin
        .from("shops")
        .select("plan, subscription_status, plan_expires_at")
        .eq("id", shop.id)
        .maybeSingle();

      return json({
        ok: true,
        local_status: applied.local_status,
        mollie_status: applied.mollie_status,
        plan: shopAfter?.plan ?? shop.plan,
        subscription_status: shopAfter?.subscription_status ?? null,
      });
    } catch (err) {
      log.error("plan_sync_error", { err });
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
