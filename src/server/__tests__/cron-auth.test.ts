import { describe, expect, test, vi, beforeEach } from "vitest";

const serverEnv = vi.fn();
vi.mock("@/server/env", () => ({ serverEnv: (...args: unknown[]) => serverEnv(...args) }));

import { resolveCronAuthDecision, bearerToken, cronAuthorized } from "@/server/cron-auth";

describe("resolveCronAuthDecision", () => {
  test("exact match against a configured cronSecret succeeds", () => {
    expect(resolveCronAuthDecision({ providedToken: "abc", cronSecret: "abc", fallbackKeys: [] })).toBe(true);
  });

  test("mismatch against a configured cronSecret fails, even if it matches a fallback key", () => {
    // Once CRON_SECRET is set, it's the only accepted credential — fallbacks don't apply.
    expect(
      resolveCronAuthDecision({ providedToken: "anon-key", cronSecret: "abc", fallbackKeys: ["anon-key"] }),
    ).toBe(false);
  });

  test("no cronSecret configured falls back to accepting a known fallback key", () => {
    expect(
      resolveCronAuthDecision({ providedToken: "anon-key", cronSecret: undefined, fallbackKeys: ["anon-key"] }),
    ).toBe(true);
  });

  test("no cronSecret and a token not in fallbackKeys is rejected", () => {
    expect(
      resolveCronAuthDecision({ providedToken: "random", cronSecret: undefined, fallbackKeys: ["anon-key"] }),
    ).toBe(false);
  });

  test("empty provided token is always rejected", () => {
    expect(resolveCronAuthDecision({ providedToken: "", cronSecret: undefined, fallbackKeys: [] })).toBe(false);
  });

  test("empty-string cronSecret is treated as not configured (falls back)", () => {
    expect(
      resolveCronAuthDecision({ providedToken: "anon-key", cronSecret: "", fallbackKeys: ["anon-key"] }),
    ).toBe(true);
  });
});

describe("bearerToken", () => {
  test("strips the Bearer prefix case-insensitively", () => {
    const req = new Request("https://x", { headers: { authorization: "bearer   abc123" } });
    expect(bearerToken(req)).toBe("abc123");
  });
  test("returns empty string when the header is missing", () => {
    const req = new Request("https://x");
    expect(bearerToken(req)).toBe("");
  });
});

describe("cronAuthorized (real-env-backed)", () => {
  beforeEach(() => serverEnv.mockReset());

  test("accepts a request bearing the configured CRON_SECRET", () => {
    serverEnv.mockImplementation((name: string) => (name === "CRON_SECRET" ? "s3cr3t" : undefined));
    const req = new Request("https://x", { headers: { authorization: "Bearer s3cr3t" } });
    expect(cronAuthorized(req)).toBe(true);
  });

  test("rejects a request with no CRON_SECRET configured and no matching fallback key", () => {
    serverEnv.mockReturnValue(undefined);
    const req = new Request("https://x", { headers: { authorization: "Bearer whatever" } });
    expect(cronAuthorized(req)).toBe(false);
  });

  test("falls back to accepting SUPABASE_ANON_KEY when CRON_SECRET is unset", () => {
    serverEnv.mockImplementation((name: string) => {
      if (name === "SUPABASE_ANON_KEY") return "public-anon-key";
      return undefined;
    });
    const req = new Request("https://x", { headers: { authorization: "Bearer public-anon-key" } });
    expect(cronAuthorized(req)).toBe(true);
  });
});
