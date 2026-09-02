import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cronAuthorized } from "@/server/cron-auth";
import { createLogger } from "@/server/logger";
import { isPendingBookingExpired } from "@/booking/server/booking-expiry-decision";
import { sendEmail } from "@/email/send-email";
import { getBookingUrl } from "@/shared/lib/booking-url";
import { formatInShopTz, resolveShopTimezone } from "@/shared/lib/shop-timezone";

const log = createLogger("booking.expiry");
const PENDING_TTL_MINUTES = 30;

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    if (!cronAuthorized(request)) return json({ error: "unauthorized" }, 401);

    const now = Date.now();
    const cutoffIso = new Date(now - PENDING_TTL_MINUTES * 60_000).toISOString();

    const { data: candidates, error } = await supabaseAdmin
      .from("bookings")
      .select("id, shop_id, status, created_at, customer_id, service_id, starts_at, deposit_cents, currency")
      .eq("status", "pending")
      .lt("created_at", cutoffIso);

    if (error) return json({ error: "fetch_failed", detail: error.message }, 500);

    // Narrow to bookings that are genuinely mid-Mollie-deposit-flow: only a
    // booking with an open (unpaid, mollie_connect-provider) payment row is a
    // candidate for expiry. A `pending` booking with no such payment (e.g. a
    // shop-created manual booking from the calendar, which also defaults to
    // "pending" but never goes through checkout.ts) must be left completely
    // untouched by this sweep — no status change, no email, no log.
    const candidateIds = (candidates ?? []).map((b) => b.id);
    let openDepositBookingIds = new Set<string>();
    if (candidateIds.length > 0) {
      const { data: openPayments, error: payFetchError } = await supabaseAdmin
        .from("payments")
        .select("booking_id")
        .in("booking_id", candidateIds)
        .eq("status", "unpaid")
        .eq("provider", "mollie_connect");
      if (payFetchError) return json({ error: "fetch_failed", detail: payFetchError.message }, 500);
      openDepositBookingIds = new Set(
        (openPayments ?? []).map((p) => p.booking_id).filter((id): id is string => !!id),
      );
    }

    const expired: string[] = [];

    for (const booking of candidates ?? []) {
      if (!openDepositBookingIds.has(booking.id)) continue;
      if (!isPendingBookingExpired(booking, now, PENDING_TTL_MINUTES)) continue;

      const { data: cancelled } = await supabaseAdmin
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!cancelled) continue;

      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("booking_id", booking.id)
        .eq("status", "unpaid");

      await supabaseAdmin.from("activity_log").insert({
        entity: "booking",
        action: "expired_pending_sweep",
        shop_id: booking.shop_id,
        metadata: { booking_id: booking.id, ttl_minutes: PENDING_TTL_MINUTES },
      });

      await sendExpiryEmail(booking).catch((err) => log.error("expiry_email_error", { booking_id: booking.id, err }));

      expired.push(booking.id);
    }

    log.info("swept", { count: expired.length });
    return json({ ok: true, ran_at: new Date(now).toISOString(), expired });
  },
};

async function sendExpiryEmail(booking: {
  id: string; shop_id: string; customer_id: string | null; service_id: string | null;
  starts_at: string; deposit_cents: number | null; currency: string | null;
}) {
  if (!booking.customer_id) return;
  const [{ data: customer }, { data: shop }, { data: service }] = await Promise.all([
    supabaseAdmin.from("customers").select("full_name, email").eq("id", booking.customer_id).maybeSingle(),
    supabaseAdmin.from("shops").select("name, slug, timezone").eq("id", booking.shop_id).maybeSingle(),
    booking.service_id
      ? supabaseAdmin.from("services").select("name").eq("id", booking.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!customer?.email) return;

  const shopTz = resolveShopTimezone(shop?.timezone);
  const whenLabel = formatInShopTz(new Date(booking.starts_at), shopTz, "EEE d MMM, HH:mm");
  const cents = booking.deposit_cents ?? 0;
  const currency = booking.currency || "EUR";
  const amountLabel = cents > 0 ? `${currency === "EUR" ? "€" : currency + " "}${(cents / 100).toFixed(2).replace(".", ",")}` : "";

  await sendEmail({
    type: "booking-payment-failed",
    to: customer.email,
    idempotencyKey: `booking-expired-${booking.id}`,
    data: {
      customerName: customer.full_name?.split(" ")[0] ?? "",
      shopName: shop?.name ?? "",
      serviceName: service?.name ?? "",
      whenLabel,
      amountLabel,
      retryUrl: getBookingUrl(shop?.slug ?? null, { external: true }),
    },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
