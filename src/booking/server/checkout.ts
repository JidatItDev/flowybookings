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
// Returns: { ok, payment_id, checkout_url }; { skipped: true } when no deposit is
// required (caller should treat as confirmed); or 409 { error: "mollie_not_connected" }
// when a deposit IS required but the shop has no working Mollie connection — the
// booking is cancelled server-side rather than silently confirmed with zero payment.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  APPLICATION_FEE_DESCRIPTION,
  MOLLIE_CONNECT_API_BASE,
  bookingFeeCentsForPlan,
  getActiveMollieAccessToken,
  resolveApplicationFeeCents,
} from "@/shop/payments/mollie-connect";
import { serverEnv } from "@/server/env";
import { createLogger } from "@/server/logger";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const log = createLogger("bookings.checkout");

async function confirmBookingIfPending(bookingId: string, currentStatus: string) {
  if (currentStatus === "confirmed") return;
  await supabaseAdmin
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", bookingId)
    .eq("status", "pending");
}

async function cancelBookingNoMollie(bookingId: string, shopId: string) {
  await supabaseAdmin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("status", "pending");
  await supabaseAdmin.from("activity_log").insert({
    entity: "booking",
    action: "blocked_no_mollie_connection",
    shop_id: shopId,
    metadata: { booking_id: bookingId },
  });
  log.warn("blocked_no_mollie_connection", { booking_id: bookingId, shop_id: shopId });
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
            // A deposit IS required but the shop has no working Mollie connection —
            // this is a shop misconfiguration, not something to silently absorb as a
            // free confirmed booking. Cancel it; the customer sees an error and the
            // slot is released for someone else.
            await cancelBookingNoMollie(booking.id, booking.shop_id);
            return json({ error: "mollie_not_connected" }, 409);
          }

          // Idempotent replay: if this booking already has an open (unpaid) payment
          // with a live Mollie checkout, hand back the SAME checkout URL instead of
          // creating a second Mollie payment.
          const { data: existingPayment } = await supabaseAdmin
            .from("payments")
            .select("id, provider_payment_id, metadata")
            .eq("booking_id", booking.id)
            .eq("status", "unpaid")
            .maybeSingle();

          if (existingPayment?.provider_payment_id) {
            const existingCheckoutUrl = (
              existingPayment.metadata as Record<string, unknown> | null
            )?.checkout_url as string | undefined;
            if (existingCheckoutUrl) {
              log.info("replayed_existing_checkout", {
                booking_id: booking.id,
                payment_id: existingPayment.id,
              });
              return json({ ok: true, payment_id: existingPayment.id, checkout_url: existingCheckoutUrl });
            }
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
          if (payErr?.code === "23505") {
            // Lost the race — another concurrent request already created the open
            // payment for this booking. Re-fetch and replay its checkout URL.
            const { data: winner } = await supabaseAdmin
              .from("payments")
              .select("id, provider_payment_id, metadata")
              .eq("booking_id", booking.id)
              .eq("status", "unpaid")
              .maybeSingle();
            const winnerUrl = (winner?.metadata as Record<string, unknown> | null)?.checkout_url as
              | string
              | undefined;
            if (winner && winnerUrl) {
              log.info("race_lost_replayed_winner", { booking_id: booking.id, payment_id: winner.id });
              return json({ ok: true, payment_id: winner.id, checkout_url: winnerUrl });
            }
            // Winner hasn't reached the Mollie-create step yet (metadata.checkout_url
            // not set) — ask the client to retry shortly rather than double-create.
            return json({ error: "checkout_in_progress" }, 409);
          }
          if (payErr || !payment) {
            log.error("payment_insert_failed", { booking_id: booking.id, err: payErr?.message });
            return json({ error: "payment_insert_failed", details: payErr?.message }, 500);
          }

          const origin = body.redirect_origin || new URL(request.url).origin;
          const redirectUrl = `${origin}/book/confirmation/${booking.id}?payment=${payment.id}`;
          const webhookSecret = serverEnv("MOLLIE_WEBHOOK_SECRET");
          const webhookUrl = webhookSecret
            ? `${origin}/api/mollie-connect/webhook?token=${encodeURIComponent(webhookSecret)}`
            : `${origin}/api/mollie-connect/webhook`;

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

          const checkoutUrl = mollie._links?.checkout?.href ?? redirectUrl;
          await supabaseAdmin
            .from("payments")
            .update({
              provider_payment_id: mollie.id,
              metadata: {
                kind: "booking_deposit",
                booking_fee_cents: bookingFeeCents,
                plan: shop?.plan ?? null,
                fee_model: "fixed_per_booking",
                checkout_url: checkoutUrl,
              },
            })
            .eq("id", payment.id);

          await supabaseAdmin.from("activity_log").insert({
            entity: "payment",
            action: "checkout_created",
            shop_id: booking.shop_id,
            metadata: { payment_id: payment.id, booking_id: booking.id, amount_cents: amountCents },
          });

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
