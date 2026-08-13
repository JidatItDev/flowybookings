// Create a Mollie payment for a booking deposit on the SHOP's connected
// Mollie account (via Mollie Connect access token), with FlowyBookings'
// application fee derived from the shop's subscription plan.
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

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  APPLICATION_FEE_DESCRIPTION,
  MOLLIE_CONNECT_API_BASE,
  bookingFeeCentsForPlan,
  getActiveMollieAccessToken,
  resolveApplicationFeeCents,
} from "@/shop/payments/mollie-connect";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function confirmBookingIfPending(bookingId: string, currentStatus: string) {
  if (currentStatus === "confirmed") return;
  await supabaseAdmin
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", bookingId)
    .eq("status", "pending");
}

export const handlers = {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }: { request: Request }) => {
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

          // Skip when there's nothing to charge — confirm server-side (anon cannot UPDATE bookings).
          if (!booking.deposit_cents || booking.deposit_cents <= 0) {
            await confirmBookingIfPending(booking.id, booking.status);
            return json({ ok: true, skipped: true, reason: "no_deposit" });
          }

          // Resolve a usable (decrypted, refreshed-if-needed) access token.
          const tokenInfo = await getActiveMollieAccessToken(booking.shop_id);
          if (!tokenInfo) {
            await confirmBookingIfPending(booking.id, booking.status);
            return json({ ok: true, skipped: true, reason: "no_mollie_connection" });
          }

          // Load provider toggle + shop (plan + per-shop fee override + DB plan_pricing)
          // to determine the FIXED booking fee in cents.
          const { data: provider } = await supabaseAdmin
            .from("shop_payment_providers")
            .select("application_fee_enabled")
            .eq("shop_id", booking.shop_id)
            .eq("provider", "mollie")
            .maybeSingle();
          const { data: shop } = await supabaseAdmin
            .from("shops")
            .select("plan, booking_fee_cents_override")
            .eq("id", booking.shop_id)
            .maybeSingle();

          // Prefer the live DB row for plan_pricing.booking_fee_cents so admin
          // edits in the dashboard apply instantly. Fall back to the constant
          // map if the row cannot be loaded for any reason.
          let planBookingFee = bookingFeeCentsForPlan(shop?.plan);
          if (shop?.plan) {
            const { data: pricingRow } = await supabaseAdmin
              .from("plan_pricing")
              .select("booking_fee_cents")
              .eq("plan_name", shop.plan)
              .maybeSingle();
            if (pricingRow && typeof pricingRow.booking_fee_cents === "number") {
              planBookingFee = pricingRow.booking_fee_cents;
            }
          }

          // Per-shop override wins (e.g. admin compensates a shop with €0 fee).
          const effectiveBookingFee =
            shop?.booking_fee_cents_override != null
              ? Math.max(0, shop.booking_fee_cents_override)
              : planBookingFee;

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
          const ownerDisabledFee = provider?.application_fee_enabled === false;
          const bookingFeeCents = ownerDisabledFee ? 0 : effectiveBookingFee;
          const feeCents = resolveApplicationFeeCents(amountCents, bookingFeeCents);

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
                booking_fee_cents: bookingFeeCents,
                plan: shop?.plan ?? null,
                fee_model: "fixed_per_booking",
              },
            })
            .select("id")
            .single();
          if (payErr || !payment) {
            return json({ error: "payment_insert_failed", details: payErr?.message }, 500);
          }

          const origin = body.redirect_origin || new URL(request.url).origin;
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
          if (tokenInfo.profileId) molliePayload.profileId = tokenInfo.profileId;
          if (feeCents > 0) {
            molliePayload.applicationFee = {
              amount: { currency, value: (feeCents / 100).toFixed(2) },
              description: APPLICATION_FEE_DESCRIPTION,
            };
          }

          const mollieRes = await fetch(`${MOLLIE_CONNECT_API_BASE}/payments`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokenInfo.accessToken}`,
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
                  booking_fee_cents: bookingFeeCents,
                  plan: shop?.plan ?? null,
                  fee_model: "fixed_per_booking",
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
    };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
