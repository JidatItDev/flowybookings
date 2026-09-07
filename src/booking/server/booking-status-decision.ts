// Pure decision logic for the shop-owner booking lifecycle (Confirm / Cancel /
// No-show / Completed, and their undos). Mirrors booking-expiry-decision.ts's
// shape — plain data in, plain verdict out, no Supabase/Mollie dependency —
// so the whole state machine is testable without mocking I/O.
//
// See docs/adr/0001-cancellation-and-refund-are-independent.md for why
// Cancel/Reschedule are gated on start time and Refund is handled separately
// (refund.ts), and CONTEXT.md for the domain vocabulary (Confirmation,
// Cancellation, No-show, Completed).

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export type BookingAction =
  | "confirm"
  | "cancel"
  | "markNoShow"
  | "undoNoShow"
  | "markCompleted"
  | "undoCompleted";

export type BookingLite = {
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
};

export type GuardContext = {
  now: number;
  /** Whether an open (unpaid) mollie_connect payment exists for this booking. */
  hasOpenPayment: boolean;
};

export type GuardResult = { allowed: true } | { allowed: false; reason: string };

type Guard = (booking: BookingLite, ctx: GuardContext) => GuardResult;

export function beforeStartTime(booking: BookingLite, ctx: GuardContext): GuardResult {
  if (ctx.now >= new Date(booking.starts_at).getTime()) {
    return { allowed: false, reason: "booking_already_started" };
  }
  return { allowed: true };
}

function afterStartTime(booking: BookingLite, ctx: GuardContext): GuardResult {
  if (ctx.now < new Date(booking.starts_at).getTime()) {
    return { allowed: false, reason: "booking_not_started_yet" };
  }
  return { allowed: true };
}

function afterEndTime(booking: BookingLite, ctx: GuardContext): GuardResult {
  if (ctx.now < new Date(booking.ends_at).getTime()) {
    return { allowed: false, reason: "booking_not_ended_yet" };
  }
  return { allowed: true };
}

function noOpenPayment(_booking: BookingLite, ctx: GuardContext): GuardResult {
  if (ctx.hasOpenPayment) return { allowed: false, reason: "payment_in_progress" };
  return { allowed: true };
}

function always(): GuardResult {
  return { allowed: true };
}

function combineGuards(...guards: Guard[]): Guard {
  return (booking, ctx) => {
    for (const guard of guards) {
      const result = guard(booking, ctx);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  };
}

type Transition = {
  from: BookingStatus[];
  to: BookingStatus;
  guard: Guard;
  requiresReason?: boolean;
};

export const TRANSITIONS: Record<BookingAction, Transition> = {
  confirm: {
    from: ["pending"],
    to: "confirmed",
    guard: combineGuards(noOpenPayment, beforeStartTime),
  },
  cancel: {
    from: ["pending", "confirmed"],
    to: "cancelled",
    guard: beforeStartTime,
    requiresReason: true,
  },
  markNoShow: {
    from: ["confirmed"],
    to: "no_show",
    guard: afterStartTime,
  },
  undoNoShow: {
    from: ["no_show"],
    to: "confirmed",
    guard: always,
  },
  markCompleted: {
    from: ["confirmed", "no_show"],
    to: "completed",
    guard: afterEndTime,
  },
  undoCompleted: {
    from: ["completed"],
    to: "confirmed",
    guard: always,
  },
};

export type TransitionResult =
  | { allowed: true; to: BookingStatus; requiresReason: boolean }
  | { allowed: false; reason: string };

export function canTransition(
  booking: BookingLite,
  action: BookingAction,
  ctx: GuardContext,
): TransitionResult {
  const transition = TRANSITIONS[action];
  if (!transition.from.includes(booking.status)) {
    return { allowed: false, reason: "invalid_current_status" };
  }
  const guardResult = transition.guard(booking, ctx);
  if (!guardResult.allowed) return guardResult;
  return { allowed: true, to: transition.to, requiresReason: !!transition.requiresReason };
}
