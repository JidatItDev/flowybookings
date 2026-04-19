// Webhook for booking deposit payments made via Mollie Connect (shop's account).
// Mollie POSTs `id=<tr_xxx>` (form-encoded). We re-fetch the payment via the
// SHOP's access_token (decrypted + auto-refreshed if needed), update the local
// payments row, and flip the booking to confirmed/cancelled accordingly.
//
// Always returns 200 unless malformed — Mollie will retry on non-2xx.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MOLLIE_CONNECT_API_BASE,
  getActiveMollieAccessToken,
} from "@/lib/mollie-connect";

type MolliePayment = {
  id: string;
  status:
    | "open"
    | "pending"
    | "paid"
    | "canceled"
    | "expired"
    | "failed"
    | "authorized";
  method?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const Route = createFileRoute("/api/mollie-connect/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get("content-type") ?? "";
          let mollieId: string | null = null;
          if (ct.includes("application/json")) {
            const body = (await request.json().catch(() => null)) as { id?: string } | null;
            mollieId = body?.id ?? null;
          } else {
            const form = await request.formData().catch(() => null);
            mollieId = form?.get("id")?.toString() ?? null;
          }
          if (!mollieId) return json({ error: "missing_id" }, 400);

          const { data: payment } = await supabaseAdmin
            .from("payments")
            .select("id, shop_id, booking_id, status, metadata")
            .eq("provider_payment_id", mollieId)
            .maybeSingle();

          if (!payment) {
            await supabaseAdmin.from("activity_log").insert({
              entity: "mollie_connect_webhook",
              action: "received_unknown",
              metadata: { mollie_id: mollieId },
            });
            return ok();
          }

          // Resolve a fresh, decrypted access token for the shop.
          const tokenInfo = await getActiveMollieAccessToken(payment.shop_id);

          let mollie: MolliePayment | null = null;
          if (tokenInfo && mollieId.startsWith("tr_")) {
            const res = await fetch(`${MOLLIE_CONNECT_API_BASE}/payments/${mollieId}`, {
              headers: { Authorization: `Bearer ${tokenInfo.accessToken}` },
            });
            if (res.ok) mollie = (await res.json()) as MolliePayment;
          }

          await supabaseAdmin.from("activity_log").insert({
            entity: "mollie_connect_webhook",
            action: "received",
            shop_id: payment.shop_id,
            metadata: {
              mollie_id: mollieId,
              mollie_status: mollie?.status ?? null,
              local_status: payment.status,
            },
          });

          const newStatus = mapStatus(mollie?.status);
          if (newStatus && newStatus !== payment.status) {
            await supabaseAdmin
              .from("payments")
              .update({
                status: newStatus,
                updated_at: new Date().toISOString(),
                metadata: {
                  ...((payment.metadata ?? {}) as Record<string, unknown>),
                  mollie_method: mollie?.method ?? null,
                },
              })
              .eq("id", payment.id);
          }

          if (payment.booking_id) {
            if (newStatus === "paid") {
              await supabaseAdmin
                .from("bookings")
                .update({ status: "confirmed", updated_at: new Date().toISOString() })
                .eq("id", payment.booking_id);
            } else if (newStatus === "failed") {
              await supabaseAdmin
                .from("bookings")
                .update({ status: "cancelled", updated_at: new Date().toISOString() })
                .eq("id", payment.booking_id)
                .eq("status", "pending");
            }
          }

          return ok();
        } catch (err) {
          console.error("[mollie-connect/webhook]", err);
          return json({ error: "internal_error" }, 500);
        }
      },
    },
  },
});

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mapStatus(s: MolliePayment["status"] | undefined): "paid" | "failed" | "unpaid" | null {
  if (!s) return null;
  if (s === "paid" || s === "authorized") return "paid";
  if (s === "failed" || s === "canceled" || s === "expired") return "failed";
  if (s === "open" || s === "pending") return "unpaid";
  return null;
}
