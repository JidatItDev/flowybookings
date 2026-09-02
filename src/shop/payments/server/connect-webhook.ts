// Webhook for booking deposit payments made via Mollie Connect (shop's account).
// Mollie POSTs `id=<tr_xxx>` (form-encoded). We re-fetch the payment via the
// SHOP's access_token (decrypted + auto-refreshed if needed), update the local
// payments row, and flip the booking to confirmed/cancelled accordingly.
//
// Always returns 200 unless malformed — Mollie will retry on non-2xx.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MOLLIE_CONNECT_API_BASE,
  getActiveMollieAccessToken,
} from "@/shop/payments/mollie-connect";
import { getBookingUrl } from "@/shared/lib/booking-url";
import { createLogger } from "@/server/logger";
import { mapMollieStatus, type MollieRawStatus } from "@/shop/payments/mollie-status";
import { verifyWebhookToken } from "@/shared/lib/webhook-auth";
import { serverEnv } from "@/server/env";
import { sendBookingConfirmationEmail } from "@/email/server/booking-confirmation";
import { sendEmail } from "@/email/send-email";
import { formatInShopTz, resolveShopTimezone } from "@/shared/lib/shop-timezone";

const log = createLogger("mollie_connect.webhook");

type MolliePayment = {
  id: string;
  status: MollieRawStatus;
  method?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const handlers = {
      POST: async ({ request }: { request: Request }) => {
        try {
          // Optional shared-secret guard. Mollie does not sign webhook bodies, so we use a
          // query-string token (or x-webhook-token header) configured when registering
          // the webhook URL with Mollie. If MOLLIE_WEBHOOK_SECRET is set, requests
          // missing/mismatching the token are rejected as spoofed.
          const expectedSecret = serverEnv("MOLLIE_WEBHOOK_SECRET");
          if (expectedSecret) {
            const url = new URL(request.url);
            const provided =
              url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
            if (!verifyWebhookToken(provided, expectedSecret)) {
              log.warn("rejected_invalid_or_missing_token");
              return json({ error: "unauthorized" }, 401);
            }
          }

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
            log.warn("received_unknown", { mollie_id: mollieId });
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

          log.info("received", {
            shop_id: payment.shop_id,
            mollie_id: mollieId,
            mollie_status: mollie?.status ?? null,
            local_status: payment.status,
          });
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

          const newStatus = mapMollieStatus(mollie?.status);
          if (newStatus && newStatus !== payment.status) {
            log.info("status_changed", {
              shop_id: payment.shop_id,
              payment_id: payment.id,
              from: payment.status,
              to: newStatus,
            });
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
              const { data: confirmedBooking } = await supabaseAdmin
                .from("bookings")
                .update({ status: "confirmed", updated_at: new Date().toISOString() })
                .eq("id", payment.booking_id)
                .eq("status", "pending")
                .select("id")
                .maybeSingle();

              await supabaseAdmin.from("activity_log").insert({
                entity: "payment",
                action: "confirmed",
                shop_id: payment.shop_id,
                metadata: { payment_id: payment.id, booking_id: payment.booking_id },
              });

              // Only email on the actual pending->confirmed transition — a retried
              // webhook delivery for an already-confirmed booking must not re-send.
              if (confirmedBooking) {
                await sendBookingConfirmationEmail(payment.booking_id).catch((err) =>
                  log.error("confirmation_email_error", { booking_id: payment.booking_id, err }),
                );
              }
            } else if (newStatus === "failed") {
              await supabaseAdmin
                .from("bookings")
                .update({ status: "cancelled", updated_at: new Date().toISOString() })
                .eq("id", payment.booking_id)
                .eq("status", "pending");

              // Notify the customer that their deposit failed and they can retry.
              await sendPaymentFailedEmail(payment.booking_id, payment.id);
            }
          }

          return ok();
        } catch (err) {
          log.error("unhandled_error", { err });
          return json({ error: "internal_error" }, 500);
        }
      },
    };
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

// Send "betaling mislukt" email to the customer with a retry link.
// Best-effort: any failure here is logged but never blocks the webhook ack.
async function sendPaymentFailedEmail(bookingId: string, paymentId: string) {
  try {
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, shop_id, starts_at, customer_id, service_id, deposit_cents, currency")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return;

    const [{ data: customer }, { data: shop }, { data: service }] = await Promise.all([
      booking.customer_id
        ? supabaseAdmin.from("customers").select("full_name, email").eq("id", booking.customer_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabaseAdmin.from("shops").select("name, slug, timezone").eq("id", booking.shop_id).maybeSingle(),
      booking.service_id
        ? supabaseAdmin.from("services").select("name").eq("id", booking.service_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    if (!customer?.email) return;

    const startsAt = new Date(booking.starts_at);
    const shopTz = resolveShopTimezone(shop?.timezone);
    const whenLabel = formatInShopTz(startsAt, shopTz, "EEE d MMM, HH:mm");
    const cents = booking.deposit_cents ?? 0;
    const currency = booking.currency || "EUR";
    const amountLabel = cents > 0
      ? `${currency === "EUR" ? "€" : currency + " "}${(cents / 100).toFixed(2).replace(".", ",")}`
      : "";
    const retryUrl = getBookingUrl(shop?.slug ?? null, { external: true });

    await sendEmail({
      type: "booking-payment-failed",
      to: customer.email,
      idempotencyKey: `booking-payment-failed-${paymentId}`,
      data: {
        customerName: customer.full_name?.split(" ")[0] ?? "",
        shopName: shop?.name ?? "",
        serviceName: service?.name ?? "",
        whenLabel,
        amountLabel,
        retryUrl,
      },
    });
  } catch (err) {
    log.error("payment_failed_email_error", { booking_id: bookingId, payment_id: paymentId, err });
  }
}
