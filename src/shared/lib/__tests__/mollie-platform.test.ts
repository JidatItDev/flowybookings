import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const serverEnv = vi.fn();
const collectServerEnvValues = vi.fn();
vi.mock("@/server/env", () => ({
  serverEnv: (...args: unknown[]) => serverEnv(...args),
  collectServerEnvValues: (...args: unknown[]) => collectServerEnvValues(...args),
}));

import {
  getMollieMode,
  mollieNamedKeyPresent,
  getMolliePrimaryKey,
  getMollieLegacyKey,
  getMolliePlatformKeys,
  mollieAuthHeader,
  isPublicHttpsOrigin,
  platformMollieWebhookUrl,
  platformMollieWebhookFields,
  mollieFetchWithFallback,
  MOLLIE_CONFIG_MISSING,
} from "@/shared/lib/mollie-platform";

function envMap(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

beforeEach(() => {
  serverEnv.mockReset();
  collectServerEnvValues.mockReset();
  collectServerEnvValues.mockReturnValue([]);
});

describe("mollieAuthHeader", () => {
  test("wraps the key as a Bearer header", () => {
    expect(mollieAuthHeader("test_abc")).toBe("Bearer test_abc");
  });
});

describe("isPublicHttpsOrigin", () => {
  test.each([
    ["https://www.flowybookings.com", true],
    ["www.flowybookings.com", true], // scheme-less input is treated as https
    ["http://www.flowybookings.com", false], // not https
    ["https://localhost", false],
    ["https://127.0.0.1", false],
    ["https://[::1]", false],
    ["https://foo.local", false],
    ["https://foo.localhost", false],
    ["https://10.0.0.5", false],
    ["https://192.168.1.5", false],
    ["https://172.16.0.5", false],
    ["https://172.31.255.255", false],
    ["https://172.32.0.1", true], // just outside the private 172.16-31 range
    ["https://169.254.1.1", false],
    ["https://0.0.0.0", false],
    ["not a url", false],
    ["", false],
    [null, false],
    [undefined, false],
  ] as const)("isPublicHttpsOrigin(%s) === %s", (input, expected) => {
    expect(isPublicHttpsOrigin(input as string | null | undefined)).toBe(expected);
  });
});

describe("getMollieMode", () => {
  test("defaults to test when unset", () => {
    serverEnv.mockImplementation(envMap({}));
    expect(getMollieMode()).toBe("test");
  });
  test("reads live mode case-insensitively", () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "LIVE" }));
    expect(getMollieMode()).toBe("live");
  });
  test("any non-live value normalizes to test", () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "staging" }));
    expect(getMollieMode()).toBe("test");
  });
});

describe("mollieNamedKeyPresent", () => {
  test("true when the mode-specific key is set", () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_API_KEY_TEST: "test_abc" }));
    expect(mollieNamedKeyPresent("test")).toBe(true);
  });
  test("false when unset", () => {
    serverEnv.mockImplementation(envMap({}));
    expect(mollieNamedKeyPresent("live")).toBe(false);
  });
});

describe("getMolliePrimaryKey", () => {
  test("returns the mode-specific key for the active mode", () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY_TEST: "test_abc" }));
    expect(getMolliePrimaryKey()).toBe("test_abc");
  });
  test("falls back to MOLLIE_API_KEY when the mode-specific key is unset", () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY: "test_fallback" }));
    expect(getMolliePrimaryKey()).toBe("test_fallback");
  });
  test("rejects a key whose prefix doesn't match the active mode", () => {
    // A live_ key sitting in MOLLIE_API_KEY while mode=test must not be used —
    // prevents accidentally charging real cards from a test-mode deploy.
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY: "live_oops" }));
    expect(getMolliePrimaryKey()).toBeNull();
  });
  test("accepts a key with no recognizable prefix (unknown mode is not rejected)", () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY: "custom_key_123" }));
    expect(getMolliePrimaryKey()).toBe("custom_key_123");
  });
  test("returns null when nothing is configured", () => {
    serverEnv.mockImplementation(envMap({}));
    expect(getMolliePrimaryKey()).toBeNull();
  });
});

describe("getMollieLegacyKey", () => {
  test("returns the legacy key when set", () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_API_KEY_LEGACY: "test_old" }));
    expect(getMollieLegacyKey()).toBe("test_old");
  });
  test("null when unset", () => {
    serverEnv.mockImplementation(envMap({}));
    expect(getMollieLegacyKey()).toBeNull();
  });
});

describe("getMolliePlatformKeys", () => {
  test("primary only when no legacy key is set", () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY_TEST: "test_abc" }));
    expect(getMolliePlatformKeys()).toEqual([{ key: "test_abc", kind: "primary" }]);
  });
  test("primary + legacy when both are set and differ", () => {
    serverEnv.mockImplementation(
      envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY_TEST: "test_abc", MOLLIE_API_KEY_LEGACY: "test_old" }),
    );
    expect(getMolliePlatformKeys()).toEqual([
      { key: "test_abc", kind: "primary" },
      { key: "test_old", kind: "legacy" },
    ]);
  });
  test("legacy is omitted when identical to primary", () => {
    serverEnv.mockImplementation(
      envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY_TEST: "test_abc", MOLLIE_API_KEY_LEGACY: "test_abc" }),
    );
    expect(getMolliePlatformKeys()).toEqual([{ key: "test_abc", kind: "primary" }]);
  });
  test("empty array when nothing is configured", () => {
    serverEnv.mockImplementation(envMap({}));
    expect(getMolliePlatformKeys()).toEqual([]);
  });
});

describe("platformMollieWebhookUrl", () => {
  test("uses a public https override when provided", () => {
    const url = platformMollieWebhookUrl("https://request-origin.example", "https://override.example");
    expect(url).toBe("https://override.example/api/mollie/webhook");
  });
  test("ignores a non-public override and falls through to APP_URL", () => {
    collectServerEnvValues.mockImplementation((name: string) =>
      name === "APP_URL" ? ["https://www.flowybookings.com"] : [],
    );
    const url = platformMollieWebhookUrl("https://request-origin.example", "http://localhost:3000");
    expect(url).toBe("https://www.flowybookings.com/api/mollie/webhook");
  });
  test("falls back to the request origin when no env var is public https", () => {
    const url = platformMollieWebhookUrl("https://request-origin.example");
    expect(url).toBe("https://request-origin.example/api/mollie/webhook");
  });
  test("returns undefined when nothing is publicly reachable (e.g. local dev)", () => {
    const url = platformMollieWebhookUrl("http://localhost:8080");
    expect(url).toBeUndefined();
  });
  test("does not duplicate the webhook path if already present in the origin", () => {
    const url = platformMollieWebhookUrl("https://override.example/api/mollie/webhook/", "https://override.example/api/mollie/webhook");
    expect(url).toBe("https://override.example/api/mollie/webhook");
  });
});

describe("platformMollieWebhookFields", () => {
  test("spreads webhookUrl when reachable", () => {
    const fields = platformMollieWebhookFields("https://request-origin.example");
    expect(fields).toEqual({ webhookUrl: "https://request-origin.example/api/mollie/webhook" });
  });
  test("omits the field entirely when not publicly reachable", () => {
    const fields = platformMollieWebhookFields("http://localhost:8080");
    expect(fields).toEqual({});
  });
});

describe("mollieFetchWithFallback", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("returns null when no Mollie keys are configured", async () => {
    serverEnv.mockImplementation(envMap({}));
    global.fetch = vi.fn();
    const result = await mollieFetchWithFallback("https://api.mollie.com/v2/payments/tr_1");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("uses the primary key and returns on a non-401/404 response", async () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY_TEST: "test_primary" }));
    const okResponse = new Response("{}", { status: 200 });
    global.fetch = vi.fn().mockResolvedValue(okResponse);
    const result = await mollieFetchWithFallback("https://api.mollie.com/v2/payments/tr_1");
    expect(result?.usedKind).toBe("primary");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer test_primary");
  });

  test("retries with the legacy key on a 401 from the primary key", async () => {
    serverEnv.mockImplementation(
      envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY_TEST: "test_primary", MOLLIE_API_KEY_LEGACY: "test_legacy" }),
    );
    const unauthorized = new Response("{}", { status: 401 });
    const ok = new Response("{}", { status: 200 });
    global.fetch = vi.fn().mockResolvedValueOnce(unauthorized).mockResolvedValueOnce(ok);
    const result = await mollieFetchWithFallback("https://api.mollie.com/v2/payments/tr_1");
    expect(result?.usedKind).toBe("legacy");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("returns the last response when every key fails", async () => {
    serverEnv.mockImplementation(envMap({ MOLLIE_MODE: "test", MOLLIE_API_KEY_TEST: "test_primary" }));
    const notFound = new Response("{}", { status: 404 });
    global.fetch = vi.fn().mockResolvedValue(notFound);
    const result = await mollieFetchWithFallback("https://api.mollie.com/v2/payments/tr_1");
    expect(result?.response.status).toBe(404);
    expect(result?.usedKind).toBe("primary");
  });
});

test("MOLLIE_CONFIG_MISSING is a stable error code string", () => {
  expect(MOLLIE_CONFIG_MISSING).toBe("server_configuration_missing");
});
