import { describe, expect, test } from "vitest";
import { isPendingBookingExpired } from "@/booking/server/booking-expiry-decision";

describe("isPendingBookingExpired", () => {
  const now = new Date("2026-09-02T12:00:00.000Z").getTime();
  const ttlMinutes = 30;

  test("not expired: pending booking created just now", () => {
    const booking = { status: "pending", created_at: new Date(now).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(false);
  });

  test("not expired: pending booking created 29 minutes ago", () => {
    const booking = { status: "pending", created_at: new Date(now - 29 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(false);
  });

  test("expired: pending booking created exactly 30 minutes ago", () => {
    const booking = { status: "pending", created_at: new Date(now - 30 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(true);
  });

  test("expired: pending booking created 1 hour ago", () => {
    const booking = { status: "pending", created_at: new Date(now - 60 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(true);
  });

  test("never expires a confirmed booking", () => {
    const booking = { status: "confirmed", created_at: new Date(now - 60 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(false);
  });

  test("never expires an already-cancelled booking", () => {
    const booking = { status: "cancelled", created_at: new Date(now - 60 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(false);
  });
});
