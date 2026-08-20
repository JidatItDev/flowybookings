/**
 * Platform Mollie account (FlowyBookings SaaS billing).
 * Shop payout accounts use Mollie Connect — see mollie-connect.ts.
 *
 * Env:
 *   MOLLIE_MODE=test|live     — which key this process uses
 *   MOLLIE_API_KEY_TEST       — test_… key (local / staging)
 *   MOLLIE_API_KEY_LIVE       — live_… key (production)
 *   MOLLIE_API_KEY            — optional fallback if the mode-specific key is unset
 *   MOLLIE_API_KEY_LEGACY     — optional rotation fallback for old objects
 */

import { collectServerEnvValues, serverEnv } from "@/server/env";

export type MollieKeyKind = "primary" | "legacy";
export type MollieEnvMode = "test" | "live";

export type MollieKey = {
  key: string;
  kind: MollieKeyKind;
};

export function getMollieMode(): MollieEnvMode {
  const raw = (serverEnv("MOLLIE_MODE") ?? "test").trim().toLowerCase();
  return raw === "live" ? "live" : "test";
}

function keyPrefixMode(key: string): MollieEnvMode | "unknown" {
  if (key.startsWith("test_")) return "test";
  if (key.startsWith("live_")) return "live";
  return "unknown";
}

export function mollieNamedKeyPresent(mode: MollieEnvMode): boolean {
  const named = mode === "live"
    ? serverEnv("MOLLIE_API_KEY_LIVE")
    : serverEnv("MOLLIE_API_KEY_TEST");
  return Boolean(named?.trim());
}

function readModeKey(mode: MollieEnvMode): string | null {
  const named = mode === "live"
    ? serverEnv("MOLLIE_API_KEY_LIVE")
    : serverEnv("MOLLIE_API_KEY_TEST");
  const fallback = serverEnv("MOLLIE_API_KEY");
  const key = (named ?? fallback)?.trim() || null;
  if (!key) return null;
  const prefix = keyPrefixMode(key);
  if (prefix !== "unknown" && prefix !== mode) return null;
  return key;
}

/** Active platform key for this environment. */
export function getMolliePrimaryKey(): string | null {
  return readModeKey(getMollieMode());
}

export function getMollieLegacyKey(): string | null {
  return serverEnv("MOLLIE_API_KEY_LEGACY")?.trim() || null;
}

export function getMolliePlatformKeys(): MollieKey[] {
  const out: MollieKey[] = [];
  const primary = getMolliePrimaryKey();
  if (primary) out.push({ key: primary, kind: "primary" });
  const legacy = getMollieLegacyKey();
  if (legacy && legacy !== primary) out.push({ key: legacy, kind: "legacy" });
  return out;
}

export function mollieAuthHeader(apiKey: string): string {
  return `Bearer ${apiKey}`;
}

export const MOLLIE_CONFIG_MISSING = "server_configuration_missing";

const PLATFORM_WEBHOOK_PATH = "/api/mollie/webhook";

/**
 * Mollie rejects webhook URLs it cannot reach (localhost, private IPs, http).
 * Local test payments still succeed without webhookUrl; status is applied on
 * return via confirm / reconcile (or a tunneled webhook if APP_URL is public https).
 */
export function isPublicHttpsOrigin(raw: string | undefined | null): boolean {
  if (!raw?.trim()) return false;
  try {
    const u = new URL(raw.includes("://") ? raw.trim() : `https://${raw.trim()}`);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
      return false;
    }
    if (host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (isPrivateHostname(host)) return false;
    return Boolean(host);
  } catch {
    return false;
  }
}

function isPrivateHostname(host: string): boolean {
  if (host === "0.0.0.0") return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function toPlatformWebhookUrl(originOrFull: string): string {
  const trimmed = originOrFull.trim();
  if (trimmed.includes(PLATFORM_WEBHOOK_PATH)) return trimmed.replace(/\/$/, "");
  return `${trimmed.replace(/\/$/, "")}${PLATFORM_WEBHOOK_PATH}`;
}

/**
 * URL to send as Mollie `webhookUrl`, or `undefined` to omit the field.
 *
 * Priority: public `webhook_url_override` → public APP_URL / PUBLIC_APP_URL / SITE_URL
 * → public request origin → omit.
 */
export function platformMollieWebhookUrl(
  origin: string,
  override?: string | null,
): string | undefined {
  if (override?.trim() && isPublicHttpsOrigin(override)) {
    return toPlatformWebhookUrl(override.trim());
  }
  for (const name of ["APP_URL", "PUBLIC_APP_URL", "SITE_URL"] as const) {
    for (const v of collectServerEnvValues(name)) {
      if (isPublicHttpsOrigin(v)) return toPlatformWebhookUrl(v);
    }
  }
  if (origin && isPublicHttpsOrigin(origin)) return toPlatformWebhookUrl(origin);
  return undefined;
}

/** Spread into a Mollie create/update JSON body. Empty when the webhook must be omitted. */
export function platformMollieWebhookFields(
  origin: string,
  override?: string | null,
): { webhookUrl?: string } {
  const webhookUrl = platformMollieWebhookUrl(origin, override);
  return webhookUrl ? { webhookUrl } : {};
}

export async function mollieFetchWithFallback(
  url: string,
  init: RequestInit = {},
): Promise<{ response: Response; usedKind: MollieKeyKind } | null> {
  const keys = getMolliePlatformKeys();
  if (keys.length === 0) return null;

  let lastResponse: Response | null = null;
  let lastKind: MollieKeyKind = "primary";

  for (const { key, kind } of keys) {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", mollieAuthHeader(key));
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(url, { ...init, headers });
    if (response.status !== 401 && response.status !== 404) {
      return { response, usedKind: kind };
    }
    lastResponse = response;
    lastKind = kind;
  }

  return lastResponse ? { response: lastResponse, usedKind: lastKind } : null;
}
