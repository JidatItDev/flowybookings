// Shop-owner booking reschedule. Not a status transition (starts_at/ends_at/
// staff_id change, status is untouched) so it lives next to, not inside,
// booking-status.ts — but reuses the exact same beforeStartTime guard from
// booking-status-decision.ts rather than duplicating it, since Cancel and
// Reschedule share the identical "can't touch something already underway"
// rule. Auth/ownership pattern mirrors refund.ts.
//
// The DB's own overlap-exclusion constraint + working-hours trigger are the
// source of truth for conflict/working-hours validation (unchanged) — this
// route does not re-implement that, it just forwards a rejected update's raw
// Postgres error fields so the client's existing classifyBookingError/
// bookingErrorToast (src/booking/lib/booking-errors.ts) keeps working unmodified.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLogger } from "@/server/logger";
import { beforeStartTime, type BookingLite } from "@/booking/server/booking-status-decision";
import { sendBookingRescheduledEmail } from "@/email/server/booking-rescheduled";

const log = createLogger("bookings.reschedule");

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
        | {
            booking_id?: string;
            new_starts_at?: string;
            new_staff_id?: string | null;
            /** Resize flow: explicit new end time. Omitted on a plain move, which keeps the existing duration. */
            new_ends_at?: string;
          }
        | null;
      if (!body?.booking_id || !body.new_starts_at) {
        return json({ error: "missing_fields" }, 400);
      }

      const { data: booking, error: bookErr } = await supabaseAdmin
        .from("bookings")
        .select("id, shop_id, status, starts_at, ends_at, staff_id")
        .eq("id", body.booking_id)
        .maybeSingle();
      if (bookErr || !booking) return json({ error: "booking_not_found" }, 404);

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

      if (booking.status !== "pending" && booking.status !== "confirmed") {
        return json({ error: "invalid_current_status" }, 409);
      }

      const bookingLite: BookingLite = {
        status: booking.status,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
      };
      const guard = beforeStartTime(bookingLite, { now: Date.now(), hasOpenPayment: false });
      if (!guard.allowed) return json({ error: guard.reason }, 409);

      const newStartsAt = new Date(body.new_starts_at);
      // Resize sends an explicit new end time (duration change, start unchanged).
      // A plain move omits it — keep the booking's existing duration in that case.
      const newEndsAt = body.new_ends_at
        ? new Date(body.new_ends_at)
        : new Date(
            newStartsAt.getTime() +
              (new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()),
          );
      const newStaffId = body.new_staff_id !== undefined ? body.new_staff_id : booking.staff_id;
      const startsAtChanged = newStartsAt.getTime() !== new Date(booking.starts_at).getTime();

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("bookings")
        .update({
          starts_at: newStartsAt.toISOString(),
          ends_at: newEndsAt.toISOString(),
          staff_id: newStaffId,
        })
        .eq("id", booking.id)
        .eq("status", booking.status)
        .select("id")
        .maybeSingle();

      if (updateErr) {
        // Forward raw Postgres error fields unclassified — the client already
        // has classifyBookingError/bookingErrorToast for this exact shape.
        return json(
          { error: "update_failed", message: updateErr.message, details: updateErr.details, hint: updateErr.hint, code: updateErr.code },
          409,
        );
      }
      if (!updated) return json({ error: "status_changed" }, 409);

      if (startsAtChanged) {
        sendBookingRescheduledEmail(booking.id, booking.starts_at).catch((err) =>
          log.error("reschedule_email_error", { booking_id: booking.id, err }),
        );
      }

      await supabaseAdmin.from("activity_log").insert({
        entity: "booking",
        action: "reschedule",
        shop_id: booking.shop_id,
        actor_user_id: userId,
        actor_email: userRes.user.email ?? null,
        metadata: {
          booking_id: booking.id,
          from_starts_at: booking.starts_at,
          to_starts_at: newStartsAt.toISOString(),
          staff_changed: newStaffId !== booking.staff_id,
        },
      });

      return json({ ok: true, starts_at: newStartsAt.toISOString(), ends_at: newEndsAt.toISOString() });
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
