// Shared cron-endpoint auth for billing hooks (billing-expiry, billing-reconcile).
// Pure decision extracted so the fallback behavior (no CRON_SECRET configured →
// accept any of a few known keys) is testable without constructing a Request.

import { serverEnv } from "@/server/env";

/**
 * True when `providedToken` is an acceptable credential.
 * Prefers an exact match against `cronSecret` when one is configured; otherwise
 * falls back to accepting any of `fallbackKeys` (service role / anon / publishable —
 * see cronAuthorized below for why the fallback exists and its trade-offs).
 */
export function resolveCronAuthDecision(opts: {
  providedToken: string;
  cronSecret?: string | null;
  fallbackKeys: string[];
}): boolean {
  const provided = opts.providedToken.trim();
  if (opts.cronSecret) return provided === opts.cronSecret;
  if (!provided) return false;
  return opts.fallbackKeys.includes(provided);
}

export function bearerToken(request: Request): string {
  return (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

/** Real-env-backed authorization check used by the billing cron hook routes. */
export function cronAuthorized(request: Request): boolean {
  const cronSecret = serverEnv("CRON_SECRET");
  const providedToken = bearerToken(request);
  const fallbackKeys = [
    serverEnv("SUPABASE_SERVICE_ROLE_KEY"),
    serverEnv("SUPABASE_ANON_KEY"),
    serverEnv("SUPABASE_PUBLISHABLE_KEY"),
  ].filter((v): v is string => Boolean(v));
  return resolveCronAuthDecision({ providedToken, cronSecret, fallbackKeys });
}
