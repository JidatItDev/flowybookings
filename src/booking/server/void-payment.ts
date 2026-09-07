// Void a still-open (unpaid) Mollie Connect payment when its booking gets
// cancelled before the customer finished paying — so a stale checkout tab
// can't complete a payment against a booking that no longer exists.
// Mirrors refund.ts's Mollie-call shape, but DELETE instead of POST .../refunds,
// and marks the payment 'failed' (matching checkout.ts's own convention for
// non-completion payment outcomes) rather than 'refunded' — nothing was ever
// captured here, so there is nothing to refund.
//
// Never call this for an already-paid/deposit_paid payment — Cancel must
// never touch a captured deposit (docs/adr/0001-cancellation-and-refund-are-independent.md).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MOLLIE_CONNECT_API_BASE, getActiveMollieAccessToken } from "@/shop/payments/mollie-connect";
import { createLogger } from "@/server/logger";

const log = createLogger("bookings.void-payment");

export async function voidOpenMolliePayment(
  paymentId: string,
  shopId: string,
  providerPaymentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tokenInfo = await getActiveMollieAccessToken(shopId);
  if (!tokenInfo) return { ok: false, error: "no_mollie_connection" };

  const mollieRes = await fetch(`${MOLLIE_CONNECT_API_BASE}/payments/${providerPaymentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenInfo.accessToken}` },
  });

  // Mollie returns 204 (no body) on success, or an error payload otherwise.
  if (!mollieRes.ok) {
    const errText = await mollieRes.text().catch(() => "");
    log.warn("void_payment_failed", { payment_id: paymentId, status: mollieRes.status, err: errText });
    return { ok: false, error: "mollie_void_failed" };
  }

  const { data: existing } = await supabaseAdmin
    .from("payments")
    .select("metadata")
    .eq("id", paymentId)
    .maybeSingle();
  const meta = (existing?.metadata ?? {}) as Record<string, unknown>;

  await supabaseAdmin
    .from("payments")
    .update({
      status: "failed",
      metadata: { ...meta, reason: "booking_cancelled", voided_at: new Date().toISOString() },
    })
    .eq("id", paymentId);

  return { ok: true };
}
