import { describe, expect, test } from "vitest";
import {
  buildCallbackRedirectUrl,
  buildConnectedProviderMetadata,
  buildProviderErrorMetadata,
  findPendingProviderByState,
  tokenExpiresAtIso,
} from "@/shop/payments/server/connect-callback-decision";

describe("findPendingProviderByState", () => {
  test("finds the row whose metadata.oauth_state matches", () => {
    const rows = [
      { id: "p1", shop_id: "s1", metadata: { oauth_state: "aaa" } },
      { id: "p2", shop_id: "s2", metadata: { oauth_state: "bbb" } },
    ];
    expect(findPendingProviderByState(rows, "bbb")).toBe(rows[1]);
  });

  test("returns null when nothing matches", () => {
    const rows = [{ id: "p1", shop_id: "s1", metadata: { oauth_state: "aaa" } }];
    expect(findPendingProviderByState(rows, "zzz")).toBeNull();
  });

  test("returns null on an empty row list", () => {
    expect(findPendingProviderByState([], "aaa")).toBeNull();
  });

  test("rows with null metadata never match (no crash)", () => {
    const rows = [{ id: "p1", shop_id: "s1", metadata: null }];
    expect(findPendingProviderByState(rows, "aaa")).toBeNull();
  });

  test("two rows racing with the same state — first one wins, deterministically", () => {
    const rows = [
      { id: "first", shop_id: "s1", metadata: { oauth_state: "dup" } },
      { id: "second", shop_id: "s2", metadata: { oauth_state: "dup" } },
    ];
    expect(findPendingProviderByState(rows, "dup")?.id).toBe("first");
  });
});

describe("tokenExpiresAtIso", () => {
  const now = Date.parse("2026-06-01T00:00:00.000Z");

  test("converts expires_in seconds to an absolute ISO timestamp", () => {
    expect(tokenExpiresAtIso(3600, now)).toBe("2026-06-01T01:00:00.000Z");
  });

  test("undefined expires_in returns null (Mollie omitted it)", () => {
    expect(tokenExpiresAtIso(undefined, now)).toBeNull();
  });

  test("zero expires_in is falsy and also returns null", () => {
    expect(tokenExpiresAtIso(0, now)).toBeNull();
  });
});

describe("buildConnectedProviderMetadata", () => {
  const base = {
    existingMeta: { oauth_state: "should-be-cleared", oauth_redirect_uri: "https://x/cb" },
    accessTokenEnc: "enc-access",
    refreshTokenEnc: "enc-refresh",
    expiresAt: "2026-06-01T01:00:00.000Z",
    organizationId: "org_1",
    organizationName: "Kappers Amsterdam",
    profileId: "pfl_1",
    scope: "organizations.read payments.read",
  };

  test("carries encrypted tokens and org/profile info through", () => {
    const result = buildConnectedProviderMetadata(base);
    expect(result.access_token_enc).toBe("enc-access");
    expect(result.refresh_token_enc).toBe("enc-refresh");
    expect(result.token_expires_at).toBe("2026-06-01T01:00:00.000Z");
    expect(result.organization_id).toBe("org_1");
    expect(result.organization_name).toBe("Kappers Amsterdam");
    expect(result.profile_id).toBe("pfl_1");
    expect(result.scopes).toBe("organizations.read payments.read");
  });

  test("strips legacy plaintext token fields", () => {
    const result = buildConnectedProviderMetadata(base);
    expect(result.access_token).toBeNull();
    expect(result.refresh_token).toBeNull();
  });

  test("clears the one-time oauth_state so it can't be replayed", () => {
    const result = buildConnectedProviderMetadata(base);
    expect(result.oauth_state).toBeNull();
    expect(result.oauth_state_created_at).toBeNull();
    expect(result.oauth_error).toBeNull();
  });

  test("resets connection_confirmed to false — forces the re-confirmation step every time", () => {
    const result = buildConnectedProviderMetadata({
      ...base,
      existingMeta: { ...base.existingMeta, connection_confirmed: true, confirmed_at: "2026-01-01T00:00:00Z" },
    });
    expect(result.connection_confirmed).toBe(false);
    expect(result.confirmed_at).toBeNull();
  });

  test("preserves unrelated existing metadata keys", () => {
    const result = buildConnectedProviderMetadata({
      ...base,
      existingMeta: { ...base.existingMeta, some_future_field: "keep-me" },
    });
    expect(result.some_future_field).toBe("keep-me");
  });

  test("null refresh token (Mollie didn't return one) is stored as null, not dropped", () => {
    const result = buildConnectedProviderMetadata({ ...base, refreshTokenEnc: null });
    expect(result.refresh_token_enc).toBeNull();
  });
});

describe("buildProviderErrorMetadata", () => {
  test("records the error and clears the one-time state so it can't be replayed", () => {
    const result = buildProviderErrorMetadata(
      { oauth_state: "abc", oauth_redirect_uri: "https://x/cb" },
      "encrypt_mollie_token failed: mollie_token_key missing in vault",
    );
    expect(result.oauth_error).toBe("encrypt_mollie_token failed: mollie_token_key missing in vault");
    expect(result.oauth_state).toBeNull();
  });

  test("preserves unrelated existing metadata keys", () => {
    const result = buildProviderErrorMetadata({ oauth_redirect_uri: "https://x/cb" }, "boom");
    expect(result.oauth_redirect_uri).toBe("https://x/cb");
  });
});

describe("buildCallbackRedirectUrl", () => {
  test("ok status, no reason", () => {
    expect(buildCallbackRedirectUrl("https://app.example.com", "ok")).toBe(
      "https://app.example.com/shop/payments?mollie_connect=ok",
    );
  });

  test("error status includes the reason param", () => {
    expect(buildCallbackRedirectUrl("https://app.example.com", "error", "invalid_state")).toBe(
      "https://app.example.com/shop/payments?mollie_connect=error&reason=invalid_state",
    );
  });

  test("works against an ngrok-style origin", () => {
    const url = buildCallbackRedirectUrl("https://hot-bernie-weirdly.ngrok-free.dev", "error", "token_exchange_failed");
    expect(url).toBe(
      "https://hot-bernie-weirdly.ngrok-free.dev/shop/payments?mollie_connect=error&reason=token_exchange_failed",
    );
  });
});
