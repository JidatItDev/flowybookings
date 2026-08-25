import { describe, expect, test } from "vitest";
import {
  accessTokenNeedsRefresh,
  cronRowIsDueForRefresh,
  planTokenRefresh,
} from "@/shop/payments/server/mollie-token-decision";

const now = Date.parse("2026-06-01T12:00:00.000Z");
const FIVE_MIN = 5 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;

describe("accessTokenNeedsRefresh (on-demand, before an API call)", () => {
  test("token expires well outside the window — no refresh needed", () => {
    expect(accessTokenNeedsRefresh("2026-06-01T13:00:00.000Z", now, FIVE_MIN)).toBe(false);
  });

  test("token expires within the window — needs refresh", () => {
    expect(accessTokenNeedsRefresh("2026-06-01T12:03:00.000Z", now, FIVE_MIN)).toBe(true);
  });

  test("token already expired — needs refresh", () => {
    expect(accessTokenNeedsRefresh("2026-06-01T11:00:00.000Z", now, FIVE_MIN)).toBe(true);
  });

  test("missing expiry is treated optimistically — assume still valid", () => {
    expect(accessTokenNeedsRefresh(null, now, FIVE_MIN)).toBe(false);
    expect(accessTokenNeedsRefresh(undefined, now, FIVE_MIN)).toBe(false);
  });

  test("unparseable expiry is also treated optimistically", () => {
    expect(accessTokenNeedsRefresh("not-a-date", now, FIVE_MIN)).toBe(false);
  });
});

describe("cronRowIsDueForRefresh (bulk, background job)", () => {
  test("expiring within the look-ahead window — due", () => {
    expect(cronRowIsDueForRefresh("2026-06-01T16:00:00.000Z", now, SIX_HOURS)).toBe(true);
  });

  test("expiring well beyond the look-ahead window — not due", () => {
    expect(cronRowIsDueForRefresh("2026-06-02T12:00:00.000Z", now, SIX_HOURS)).toBe(false);
  });

  test("missing expiry is treated proactively — always due (opposite of the on-demand check)", () => {
    expect(cronRowIsDueForRefresh(null, now, SIX_HOURS)).toBe(true);
    expect(cronRowIsDueForRefresh(undefined, now, SIX_HOURS)).toBe(true);
  });

  test("unparseable expiry is also treated as due", () => {
    expect(cronRowIsDueForRefresh("garbage", now, SIX_HOURS)).toBe(true);
  });
});

describe("planTokenRefresh", () => {
  test("a row with no refresh_token_enc is skipped regardless of expiry", () => {
    const plan = planTokenRefresh(
      [{ id: "p1", metadata: { token_expires_at: "2026-06-01T13:00:00.000Z" } }],
      now,
      SIX_HOURS,
    );
    expect(plan).toEqual([{ id: "p1", action: "skip_no_refresh_token", refreshTokenEnc: null }]);
  });

  test("a row not yet due is skipped, refreshTokenEnc still surfaced for visibility", () => {
    const plan = planTokenRefresh(
      [
        {
          id: "p1",
          metadata: { refresh_token_enc: "enc-1", token_expires_at: "2026-06-05T00:00:00.000Z" },
        },
      ],
      now,
      SIX_HOURS,
    );
    expect(plan).toEqual([{ id: "p1", action: "skip_not_due", refreshTokenEnc: "enc-1" }]);
  });

  test("a row due for refresh is flagged with its refresh token", () => {
    const plan = planTokenRefresh(
      [
        {
          id: "p1",
          metadata: { refresh_token_enc: "enc-1", token_expires_at: "2026-06-01T15:00:00.000Z" },
        },
      ],
      now,
      SIX_HOURS,
    );
    expect(plan).toEqual([{ id: "p1", action: "refresh", refreshTokenEnc: "enc-1" }]);
  });

  test("a row with a refresh token but no known expiry is due (proactive default)", () => {
    const plan = planTokenRefresh([{ id: "p1", metadata: { refresh_token_enc: "enc-1" } }], now, SIX_HOURS);
    expect(plan).toEqual([{ id: "p1", action: "refresh", refreshTokenEnc: "enc-1" }]);
  });

  test("mixed batch — each row categorized independently, order preserved", () => {
    const rows = [
      { id: "no-token", metadata: {} },
      { id: "due", metadata: { refresh_token_enc: "enc-due", token_expires_at: "2026-06-01T13:00:00.000Z" } },
      { id: "not-due", metadata: { refresh_token_enc: "enc-ok", token_expires_at: "2026-06-10T00:00:00.000Z" } },
    ];
    const plan = planTokenRefresh(rows, now, SIX_HOURS);
    expect(plan.map((p) => [p.id, p.action])).toEqual([
      ["no-token", "skip_no_refresh_token"],
      ["due", "refresh"],
      ["not-due", "skip_not_due"],
    ]);
  });

  test("null metadata on a row never crashes — treated as no refresh token", () => {
    const plan = planTokenRefresh([{ id: "p1", metadata: null }], now, SIX_HOURS);
    expect(plan).toEqual([{ id: "p1", action: "skip_no_refresh_token", refreshTokenEnc: null }]);
  });

  test("empty row list returns an empty plan", () => {
    expect(planTokenRefresh([], now, SIX_HOURS)).toEqual([]);
  });
});
