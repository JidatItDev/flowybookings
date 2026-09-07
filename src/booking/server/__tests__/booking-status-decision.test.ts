import { describe, expect, test } from "vitest";
import { canTransition, type BookingLite } from "@/booking/server/booking-status-decision";

const NOW = new Date("2026-09-07T12:00:00.000Z").getTime();
const PAST = new Date(NOW - 60 * 60_000).toISOString(); // 1h ago
const FUTURE = new Date(NOW + 60 * 60_000).toISOString(); // 1h from now

function booking(overrides: Partial<BookingLite>): BookingLite {
  return {
    status: "pending",
    starts_at: FUTURE,
    ends_at: new Date(NOW + 2 * 60 * 60_000).toISOString(),
    ...overrides,
  };
}

describe("confirm", () => {
  test("allowed: pending, before start, no open payment", () => {
    const result = canTransition(booking({ status: "pending" }), "confirm", { now: NOW, hasOpenPayment: false });
    expect(result).toEqual({ allowed: true, to: "confirmed", requiresReason: false });
  });

  test("denied: open payment blocks confirm outright", () => {
    const result = canTransition(booking({ status: "pending" }), "confirm", { now: NOW, hasOpenPayment: true });
    expect(result).toEqual({ allowed: false, reason: "payment_in_progress" });
  });

  test("denied: booking already started", () => {
    const result = canTransition(booking({ status: "pending", starts_at: PAST }), "confirm", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "booking_already_started" });
  });

  test("open-payment guard checked before the start-time guard", () => {
    const result = canTransition(booking({ status: "pending", starts_at: PAST }), "confirm", {
      now: NOW,
      hasOpenPayment: true,
    });
    expect(result).toEqual({ allowed: false, reason: "payment_in_progress" });
  });

  test("denied: wrong starting status", () => {
    const result = canTransition(booking({ status: "confirmed" }), "confirm", { now: NOW, hasOpenPayment: false });
    expect(result).toEqual({ allowed: false, reason: "invalid_current_status" });
  });
});

describe("cancel", () => {
  test("allowed: pending, before start", () => {
    const result = canTransition(booking({ status: "pending" }), "cancel", { now: NOW, hasOpenPayment: false });
    expect(result).toEqual({ allowed: true, to: "cancelled", requiresReason: true });
  });

  test("allowed: confirmed, before start", () => {
    const result = canTransition(booking({ status: "confirmed" }), "cancel", { now: NOW, hasOpenPayment: false });
    expect(result).toEqual({ allowed: true, to: "cancelled", requiresReason: true });
  });

  test("denied: exactly at start time", () => {
    const result = canTransition(booking({ status: "confirmed", starts_at: new Date(NOW).toISOString() }), "cancel", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "booking_already_started" });
  });

  test("denied: booking already started", () => {
    const result = canTransition(booking({ status: "confirmed", starts_at: PAST }), "cancel", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "booking_already_started" });
  });

  test("denied: already cancelled", () => {
    const result = canTransition(booking({ status: "cancelled" }), "cancel", { now: NOW, hasOpenPayment: false });
    expect(result).toEqual({ allowed: false, reason: "invalid_current_status" });
  });

  test("denied: no_show cannot be cancelled (not reversible via cancel)", () => {
    const result = canTransition(booking({ status: "no_show", starts_at: PAST }), "cancel", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "invalid_current_status" });
  });
});

describe("markNoShow", () => {
  test("allowed: confirmed, exactly at start time", () => {
    const result = canTransition(
      booking({ status: "confirmed", starts_at: new Date(NOW).toISOString() }),
      "markNoShow",
      { now: NOW, hasOpenPayment: false },
    );
    expect(result).toEqual({ allowed: true, to: "no_show", requiresReason: false });
  });

  test("allowed: confirmed, well after start time", () => {
    const result = canTransition(booking({ status: "confirmed", starts_at: PAST }), "markNoShow", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: true, to: "no_show", requiresReason: false });
  });

  test("denied: booking hasn't started yet", () => {
    const result = canTransition(booking({ status: "confirmed", starts_at: FUTURE }), "markNoShow", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "booking_not_started_yet" });
  });

  test("denied: pending booking cannot be marked no-show", () => {
    const result = canTransition(booking({ status: "pending", starts_at: PAST }), "markNoShow", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "invalid_current_status" });
  });
});

describe("undoNoShow", () => {
  test("allowed: from no_show, regardless of time", () => {
    const result = canTransition(booking({ status: "no_show", starts_at: FUTURE }), "undoNoShow", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: true, to: "confirmed", requiresReason: false });
  });

  test("denied: not currently no_show", () => {
    const result = canTransition(booking({ status: "confirmed" }), "undoNoShow", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "invalid_current_status" });
  });
});

describe("markCompleted", () => {
  test("allowed: confirmed, exactly at end time", () => {
    const result = canTransition(
      booking({ status: "confirmed", ends_at: new Date(NOW).toISOString() }),
      "markCompleted",
      { now: NOW, hasOpenPayment: false },
    );
    expect(result).toEqual({ allowed: true, to: "completed", requiresReason: false });
  });

  test("allowed: no_show, after end time", () => {
    const result = canTransition(
      booking({ status: "no_show", starts_at: PAST, ends_at: PAST }),
      "markCompleted",
      { now: NOW, hasOpenPayment: false },
    );
    expect(result).toEqual({ allowed: true, to: "completed", requiresReason: false });
  });

  test("denied: appointment hasn't ended yet", () => {
    const result = canTransition(booking({ status: "confirmed", ends_at: FUTURE }), "markCompleted", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "booking_not_ended_yet" });
  });

  test("denied: pending booking cannot be marked completed", () => {
    const result = canTransition(
      booking({ status: "pending", starts_at: PAST, ends_at: PAST }),
      "markCompleted",
      { now: NOW, hasOpenPayment: false },
    );
    expect(result).toEqual({ allowed: false, reason: "invalid_current_status" });
  });

  test("denied: cancelled booking cannot be marked completed", () => {
    const result = canTransition(
      booking({ status: "cancelled", starts_at: PAST, ends_at: PAST }),
      "markCompleted",
      { now: NOW, hasOpenPayment: false },
    );
    expect(result).toEqual({ allowed: false, reason: "invalid_current_status" });
  });
});

describe("undoCompleted", () => {
  test("allowed: from completed, regardless of time", () => {
    const result = canTransition(booking({ status: "completed", starts_at: PAST, ends_at: PAST }), "undoCompleted", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: true, to: "confirmed", requiresReason: false });
  });

  test("denied: not currently completed", () => {
    const result = canTransition(booking({ status: "no_show", starts_at: PAST }), "undoCompleted", {
      now: NOW,
      hasOpenPayment: false,
    });
    expect(result).toEqual({ allowed: false, reason: "invalid_current_status" });
  });
});
