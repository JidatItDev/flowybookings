// Refund a Mollie Connect booking payment.
// Auth: requires the caller to be the shop owner (or super_admin).
// Mechanics:
//   1. Verify Bearer token via supabaseAdmin.auth.getUser.
//   2. Resolve a fresh Mollie access token for the shop (decrypt + auto-refresh).
//   3. Call POST https://api.mollie.com/v2/payments/{id}/refunds.
//   4. Mark the payments row as 'refunded' on success.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MOLLIE_CONNECT_API_BASE, getActiveMollieAccessToken } from "@/lib/mollie-connect";

export const Route = createFileRoute("/api/bookings/refund")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!token) return json({ error: "unauthenticated" }, 401);

          const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
          const userId = userRes.user.id;

          const body = (await request.json().catch(() => null)) as
            | { payment_id?: string; amount_cents?: number }
            | null;
          if (!body?.payment_id) return json({ error: "missing_payment_id" }, 400);

          const { data: payment, error: payErr } = await supabaseAdmin
            .from("payments")
            .select(
              "id, shop_id, amount_cents, currency, provider, provider_payment_id, status, metadata",
            )
            .eq("id", body.payment_id)
            .maybeSingle();
          if (payErr || !payment) return json({ error: "payment_not_found" }, 404);
          if (payment.provider !== "mollie_connect" || !payment.provider_payment_id) {
            return json({ error: "not_refundable" }, 400);
          }
          if (payment.status === "refunded") return json({ error: "already_refunded" }, 400);

          // Ownership check (shop owner or super_admin).
          const { data: shop } = await supabaseAdmin
            .from("shops")
            .select("owner_id")
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

          const tokenInfo = await getActiveMollieAccessToken(payment.shop_id);
          if (!tokenInfo) return json({ error: "no_mollie_connection" }, 400);

          const amountCents = Math.min(
            Math.max(1, body.amount_cents ?? payment.amount_cents),
            payment.amount_cents,
          );
          const currency = payment.currency || "EUR";

          const mollieRes = await fetch(
            `${MOLLIE_CONNECT_API_BASE}/payments/${payment.provider_payment_id}/refunds`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${tokenInfo.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                amount: { currency, value: (amountCents / 100).toFixed(2) },
                description: "Refund via FlowyBookings",
              }),
            },
          );
          if (!mollieRes.ok) {
            const errText = await mollieRes.text();
            console.error("[bookings/refund] mollie refund failed", mollieRes.status, errText);
            return json({ error: "mollie_refund_failed", details: errText }, 502);
          }
          const refund = (await mollieRes.json()) as { id: string; status?: string };

          const meta = (payment.metadata ?? {}) as Record<string, unknown>;
          await supabaseAdmin
            .from("payments")
            .update({
              status: "refunded",
              metadata: {
                ...meta,
                refund_id: refund.id,
                refund_status: refund.status ?? null,
                refund_amount_cents: amountCents,
                refunded_at: new Date().toISOString(),
                refunded_by: userId,
              },
            })
            .eq("id", payment.id);

          await supabaseAdmin.from("activity_log").insert({
            entity: "payment",
            action: "refunded",
            shop_id: payment.shop_id,
            actor_user_id: userId,
            actor_email: userRes.user.email ?? null,
            metadata: {
              payment_id: payment.id,
              mollie_payment_id: payment.provider_payment_id,
              refund_id: refund.id,
              amount_cents: amountCents,
            },
          });

          return json({ ok: true, refund_id: refund.id });
        } catch (err) {
          console.error("[bookings/refund] error:", err);
          return json({ error: "internal_error", details: (err as Error).message }, 500);
        }
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
