// src/booking/lib/__tests__/booking-errors.test.ts
import { describe, expect, test } from "vitest";
import { classifyBookingError } from "@/booking/lib/booking-errors";

describe("classifyBookingError", () => {
  test("BOOKING_CONFLICT trigger message classifies as conflict", () => {
    const err = { message: "BOOKING_CONFLICT: staff has overlapping booking abc-123 from 2026-09-02T09:00:00Z to 2026-09-02T09:30:00Z" };
    expect(classifyBookingError(err).kind).toBe("conflict");
  });

  test("Postgres exclusion-violation (23P01) classifies as conflict", () => {
    const err = {
      code: "23P01",
      message: 'conflicting key value violates exclusion constraint "bookings_no_overlap_excl"',
    };
    expect(classifyBookingError(err).kind).toBe("conflict");
  });

  test("BOOKING_OUTSIDE_HOURS with a range classifies as outside_hours with the range", () => {
    const err = { message: "BOOKING_OUTSIDE_HOURS: 18:30 is outside staff working hours (09:00-17:00)" };
    const info = classifyBookingError(err);
    expect(info.kind).toBe("outside_hours");
    expect(info.hoursRange).toBe("09:00–17:00");
  });

  test("BOOKING_DURING_BREAK classifies as during_break with the range", () => {
    const err = { message: "BOOKING_DURING_BREAK: booking overlaps staff break (12:00-13:00)" };
    const info = classifyBookingError(err);
    expect(info.kind).toBe("during_break");
    expect(info.breakRange).toBe("12:00–13:00");
  });

  test("staff off / not scheduled classifies as closed_day", () => {
    const err = { message: "BOOKING_OUTSIDE_HOURS: staff is off on Tuesday (tue)" };
    expect(classifyBookingError(err).kind).toBe("closed_day");
  });

  test("unrecognized error classifies as unknown", () => {
    const err = { message: "some_other_db_error" };
    expect(classifyBookingError(err).kind).toBe("unknown");
  });

  test("non-object error input does not throw", () => {
    expect(classifyBookingError("plain string error").kind).toBe("unknown");
    expect(classifyBookingError(null).kind).toBe("unknown");
  });
});
