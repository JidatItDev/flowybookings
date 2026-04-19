// Create a Mollie payment for a booking deposit on the SHOP's connected
// Mollie account (via Mollie Connect access token), with FlowyBookings'
// application fee.
//
// Caller: POST /api/bookings/checkout  body: { booking_id, redirect_origin? }
// PUBLIC route — anyone with a booking ID can initiate the checkout because
// /book is a public flow. Security comes from:
//   - The booking must already exist (created by RLS-allowed public insert)
//   - We only ever charge what's stored on the service.deposit_cents
//   - We don't return any sensitive shop/Mollie data
//
// Returns: { ok, payment_id, checkout_url } or { skipped: true } when no Mollie
// connection exists / no deposit is required (caller should treat as confirmed).

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  APPLICATION_FEE_DESCRIPTION,
  APPLICATION_FEE_PERCENT_DEFAULT,
  MOLLIE_CONNECT_API_BASE,
  computeApplicationFeeCents,
} from "@/lib/mollie-connect";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/bookings/checkout")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as
            | { booking_id?: string; redirect_origin?: string }
            | null;
          if (!body?.booking_id) return json({ error: "missing_booking_id" }, 400);

          const { data: booking, error: bookErr } = await supabaseAdmin
            .from("bookings")
            .select(
              "id, shop_id, service_id, customer_id, deposit_cents, price_cents, currency, status",
            )
            .eq("id", body.booking_id)
            .maybeSingle();
          if (bookErr || !booking) return json({ error: "booking_not_found" }, 404);

          // Skip when there's nothing to charge.
          if (!booking.deposit_cents || booking.deposit_cents <= 0) {
            return json({ ok: true, skipped: true, reason: "no_deposit" });
          }

          // Look up shop's Mollie Connect link.
          const { data: provider } = await supabaseAdmin
            .from("shop_payment_providers")
            .select("connection_status, application_fee_enabled, application_fee_percent, metadata")
            .eq("shop_id", booking.shop_id)
            .eq("provider", "mollie")
            .maybeSingle();

          if (!provider || provider.connection_status !== "connected") {
            return json({ ok: true, skipped: true, reason: "no_mollie_connection" });
          }
          const meta = (provider.metadata ?? {}) as Record<string, unknown>;
          const accessToken = meta.access_token as string | undefined;
          const profileId = (meta.profile_id as string | undefined) ?? null;
          if (!accessToken) {
            return json({ ok: true, skipped: true, reason: "no_access_token" });
          }

          // Resolve customer email (best-effort).
          let customerEmail: string | null = null;
          if (booking.customer_id) {
            const { data: cust } = await supabaseAdmin
              .from("customers")
              .select("email")
              .eq("id", booking.customer_id)
              .maybeSingle();
            customerEmail = cust?.email ?? null;
          }

          const amountCents = booking.deposit_cents;
          const currency = booking.currency || "EUR";
          const feePercent = provider.application_fee_enabled
            ? Number(provider.application_fee_percent ?? APPLICATION_FEE_PERCENT_DEFAULT)
            : 0;
          const feeCents = computeApplicationFeeCents(amountCents, feePercent);

          // Pre-create local payment row (status=unpaid) for webhook correlation.
          const { data: payment, error: payErr } = await supabaseAdmin
            .from("payments")
            .insert({
              shop_id: booking.shop_id,
              booking_id: booking.id,
              amount_cents: amountCents,
              application_fee_cents: feeCents,
              currency,
              status: "unpaid",
              provider: "mollie_connect",
              metadata: {
                kind: "booking_deposit",
                fee_percent: feePercent,
              },
            })
            .select("id")
            .single();
          if (payErr || !payment) {
            return json({ error: "payment_insert_failed", details: payErr?.message }, 500);
          }

          const origin =
            body.redirect_origin ||
            new URL(request.url).origin;
          const redirectUrl = `${origin}/book/confirmation/${booking.id}?payment=${payment.id}`;
          const webhookUrl = `${origin}/api/mollie-connect/webhook`;

          const molliePayload: Record<string, unknown> = {
            amount: { currency, value: (amountCents / 100).toFixed(2) },
            description: `Aanbetaling boeking ${booking.id.slice(0, 8)}`,
            redirectUrl,
            webhookUrl,
            metadata: {
              payment_id: payment.id,
              booking_id: booking.id,
              shop_id: booking.shop_id,
              kind: "booking_deposit",
            },
          };
          if (customerEmail) molliePayload.billingEmail = customerEmail;
          if (profileId) molliePayload.profileId = profileId;
          if (feeCents > 0) {
            molliePayload.applicationFee = {
              amount: { currency, value: (feeCents / 100).toFixed(2) },
              description: APPLICATION_FEE_DESCRIPTION,
            };
          }

          const mollieRes = await fetch(`${MOLLIE_CONNECT_API_BASE}/payments`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(molliePayload),
          });
          if (!mollieRes.ok) {
            const errText = await mollieRes.text();
            console.error("[bookings/checkout] mollie create failed", mollieRes.status, errText);
            await supabaseAdmin
              .from("payments")
              .update({
                status: "failed",
                metadata: {
                  kind: "booking_deposit",
                  fee_percent: feePercent,
                  mollie_error: errText,
                  mollie_status: mollieRes.status,
                },
              })
              .eq("id", payment.id);
            return json({ error: "mollie_create_failed", details: errText }, 502);
          }
          const mollie = (await mollieRes.json()) as {
            id: string;
            _links?: { checkout?: { href?: string } };
          };

          await supabaseAdmin
            .from("payments")
            .update({ provider_payment_id: mollie.id })
            .eq("id", payment.id);

          const checkoutUrl = mollie._links?.checkout?.href ?? redirectUrl;
          return json({ ok: true, payment_id: payment.id, checkout_url: checkoutUrl });
        } catch (err) {
          console.error("[bookings/checkout] error:", err);
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
