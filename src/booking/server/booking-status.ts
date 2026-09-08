// Shop-owner booking status transitions: Confirm / Cancel / No-show / Completed
// (+ undos). Auth and ownership-check mirror refund.ts exactly. The actual
// transition rules (which statuses can go where, guards, whether a reason is
// required) live in booking-status-decision.ts — this file is the thin
// orchestration layer: load data, ask the decision layer, write it, fire the
// side effect, log it.
//
// See docs/adr/0001-cancellation-and-refund-are-independent.md and
// CONTEXT.md for the domain rules this implements.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLogger } from "@/server/logger";
import {
  canTransition,
  type BookingAction,
  type BookingLite,
} from "@/booking/server/booking-status-decision";
import { sendBookingConfirmationEmail } from "@/email/server/booking-confirmation";
import { sendBookingCancelledEmail } from "@/email/server/booking-cancelled";
import { voidOpenMolliePayment } from "@/booking/server/void-payment";

const log = createLogger("bookings.status");

const VALID_ACTIONS: BookingAction[] = [
  "confirm",
  "cancel",
  "markNoShow",
  "undoNoShow",
  "markCompleted",
  "undoCompleted",
];

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    try {
      const authHeader = request.headers.get("authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "unauthenticated" }, 401);

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
      const userId = userRes.user.id;

      const body = (await request.json().catch(() => null)) as
        | { booking_id?: string; action?: string; reason?: string }
        | null;
      if (!body?.booking_id) return json({ error: "missing_booking_id" }, 400);
      if (!body.action || !VALID_ACTIONS.includes(body.action as BookingAction)) {
        return json({ error: "invalid_action" }, 400);
      }
      const action = body.action as BookingAction;

      const { data: booking, error: bookErr } = await supabaseAdmin
        .from("bookings")
        .select("id, shop_id, status, starts_at, ends_at")
        .eq("id", body.booking_id)
        .maybeSingle();
      if (bookErr || !booking) return json({ error: "booking_not_found" }, 404);

      // Ownership check (shop owner or super_admin) — identical to refund.ts.
      const { data: shop } = await supabaseAdmin
        .from("shops")
        .select("owner_id")
        .eq("id", booking.shop_id)
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

      // Only "confirm" cares about this, but it's one cheap query either way.
      const { data: openPayment } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("provider", "mollie_connect")
        .eq("status", "unpaid")
        .maybeSingle();

      const bookingLite: BookingLite = {
        status: booking.status,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
      };
      const verdict = canTransition(bookingLite, action, {
        now: Date.now(),
        hasOpenPayment: !!openPayment,
      });
      if (!verdict.allowed) return json({ error: verdict.reason }, 409);

      if (verdict.requiresReason && !body.reason?.trim()) {
        return json({ error: "missing_reason" }, 400);
      }

      const updatePayload: {
        status: typeof verdict.to;
        cancellation_reason?: string;
        cancelled_at?: string;
      } = { status: verdict.to };
      if (action === "cancel") {
        updatePayload.cancellation_reason = body.reason!.trim();
        updatePayload.cancelled_at = new Date().toISOString();
      }

      // Guarded update: only succeeds if status is still what we just checked —
      // same race-safe idiom as connect-webhook.ts/checkout.ts. A `null` result
      // means someone else changed the booking between our read and this write.
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("bookings")
        .update(updatePayload)
        .eq("id", booking.id)
        .eq("status", booking.status)
        .select("id")
        .maybeSingle();
      if (updateErr) return json({ error: "update_failed", details: updateErr.message }, 500);
      if (!updated) return json({ error: "status_changed" }, 409);

      // Side effects never roll back the status change — mirrors
      // connect-webhook.ts's own .catch() pattern for its confirmation email.
      if (action === "confirm") {
        sendBookingConfirmationEmail(booking.id).catch((err) =>
          log.error("confirm_email_error", { booking_id: booking.id, err }),
        );
      } else if (action === "cancel") {
        sendBookingCancelledEmail(booking.id).catch((err) =>
          log.error("cancel_email_error", { booking_id: booking.id, err }),
        );
        if (openPayment) {
          const { data: paymentRow } = await supabaseAdmin
            .from("payments")
            .select("id, provider_payment_id")
            .eq("id", openPayment.id)
            .maybeSingle();
          if (paymentRow?.provider_payment_id) {
            voidOpenMolliePayment(paymentRow.id, booking.shop_id, paymentRow.provider_payment_id)
              .then((result) => {
                if (!result.ok) {
                  log.error("void_payment_failed", { booking_id: booking.id, error: result.error });
                }
              })
              .catch((err) => log.error("void_payment_error", { booking_id: booking.id, err }));
          }
        }
      }

      await supabaseAdmin.from("activity_log").insert({
        entity: "booking",
        action,
        shop_id: booking.shop_id,
        actor_user_id: userId,
        actor_email: userRes.user.email ?? null,
        metadata: {
          booking_id: booking.id,
          from_status: booking.status,
          to_status: verdict.to,
          reason: action === "cancel" ? body.reason!.trim() : undefined,
        },
      });

      return json({ ok: true, status: verdict.to });
    } catch (err) {
      log.error("internal_error", { err: (err as Error).message });
      return json({ error: "internal_error", details: (err as Error).message }, 500);
    }
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
