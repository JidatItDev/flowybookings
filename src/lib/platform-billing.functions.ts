// Server functions for inspecting FlowyBookings' OWN platform Mollie billing setup.
// SUPER ADMIN ONLY. Never returns secret values — only presence flags + a live ping result.
//
// This is for the platform's subscription billing (Basic/Pro/Premium plan payments via
// FlowyBookings' Mollie account). It is COMPLETELY SEPARATE from shop_payment_providers,
// which holds each shop's own Mollie Connect account for booking deposits.

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLATFORM_PROVIDER, BILLING_ENTITY } from "@/lib/platform-billing";

export type PlatformBillingStatus = {
  // Secret presence (never the raw values).
  apiKeyPresent: boolean;
  apiKeyMode: "test" | "live" | "unknown" | "missing";
  apiKeyMasked: string | null;
  clientIdPresent: boolean;
  clientSecretPresent: boolean;
  webhookConfigured: boolean;
  webhookUrl: string;
  // Admin-managed config (DB).
  configuredMode: "test" | "live";
  webhookUrlOverride: string | null;
  configUpdatedAt: string | null;
  lastHealthStatus: string | null;
  lastHealthMessage: string | null;
  lastHealthAt: string | null;
  lastHealthMode: string | null;
  // Activity signals.
  lastWebhookAt: string | null;
  lastSubscriptionPaymentAt: string | null;
  lastSubscriptionPaymentStatus: string | null;
  totalSubscriptionPayments: number;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  // Readiness summary.
  isReady: boolean;
};

/** Required secret names — surfaced in the admin UI so admins know exactly what to add. */
export const PLATFORM_BILLING_SECRETS = {
  apiKey: "MOLLIE_API_KEY",
  clientId: "MOLLIE_CLIENT_ID",
  clientSecret: "MOLLIE_CLIENT_SECRET",
} as const;

async function assertSuperAdmin(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("unauthenticated");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
  if (!isAdmin) throw new Error("forbidden");
  return data.user;
}

function maskKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}

export const getPlatformBillingStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }): Promise<PlatformBillingStatus> => {
    await assertSuperAdmin(data.accessToken);

    const apiKey = process.env.MOLLIE_API_KEY;
    const clientId = process.env.MOLLIE_CLIENT_ID;
    const clientSecret = process.env.MOLLIE_CLIENT_SECRET;
    const webhookBase = process.env.PUBLIC_APP_URL || process.env.SITE_URL || "";

    let mode: PlatformBillingStatus["apiKeyMode"] = "missing";
    if (apiKey?.startsWith("test_")) mode = "test";
    else if (apiKey?.startsWith("live_")) mode = "live";
    else if (apiKey) mode = "unknown";

    // Last webhook ping for the platform (any mollie webhook touched).
    const { data: lastWebhook } = await supabaseAdmin
      .from("activity_log")
      .select("created_at")
      .eq("entity", "mollie_webhook")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Last subscription payment for FlowyBookings.
    const { data: lastSub } = await supabaseAdmin
      .from("payments")
      .select("created_at, status")
      .eq("provider", PLATFORM_PROVIDER)
      .is("booking_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: totalCount } = await supabaseAdmin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("provider", PLATFORM_PROVIDER)
      .is("booking_id", null);

    // Most recent platform billing error (from health check or webhook).
    const { data: lastError } = await supabaseAdmin
      .from("activity_log")
      .select("created_at, metadata")
      .eq("entity", BILLING_ENTITY)
      .in("action", ["health_check_failed", "subscription_payment_failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const errMeta = (lastError?.metadata ?? {}) as Record<string, unknown>;
    const lastErrorMessage =
      typeof errMeta.error === "string"
        ? errMeta.error
        : typeof errMeta.message === "string"
          ? errMeta.message
          : null;

    // Admin-managed config row (singleton).
    const { data: cfg } = await supabaseAdmin
      .from("platform_billing_config")
      .select(
        "mode, webhook_url_override, updated_at, last_health_status, last_health_message, last_health_at, last_health_mode",
      )
      .eq("id", 1)
      .maybeSingle();

    const configuredMode: "test" | "live" = cfg?.mode === "live" ? "live" : "test";
    const baseWebhook = cfg?.webhook_url_override?.trim() || webhookBase;
    const finalWebhookUrl = baseWebhook
      ? `${baseWebhook.replace(/\/$/, "")}/api/mollie/webhook`
      : "/api/mollie/webhook";

    return {
      apiKeyPresent: Boolean(apiKey),
      apiKeyMode: mode,
      apiKeyMasked: maskKey(apiKey),
      clientIdPresent: Boolean(clientId),
      clientSecretPresent: Boolean(clientSecret),
      webhookConfigured: Boolean(baseWebhook),
      webhookUrl: finalWebhookUrl,
      configuredMode,
      webhookUrlOverride: cfg?.webhook_url_override ?? null,
      configUpdatedAt: cfg?.updated_at ?? null,
      lastHealthStatus: cfg?.last_health_status ?? null,
      lastHealthMessage: cfg?.last_health_message ?? null,
      lastHealthAt: cfg?.last_health_at ?? null,
      lastHealthMode: cfg?.last_health_mode ?? null,
      lastWebhookAt: lastWebhook?.created_at ?? null,
      lastSubscriptionPaymentAt: lastSub?.created_at ?? null,
      lastSubscriptionPaymentStatus: lastSub?.status ?? null,
      totalSubscriptionPayments: totalCount ?? 0,
      lastErrorMessage,
      lastErrorAt: lastError?.created_at ?? null,
      isReady: Boolean(apiKey),
    };
  });

/** Update the admin-editable, non-secret config (mode + webhook override). */
export const updatePlatformBillingConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { accessToken: string; mode?: "test" | "live"; webhookUrlOverride?: string | null }) => input,
  )
  .handler(async ({ data }) => {
    const user = await assertSuperAdmin(data.accessToken);
    const patch: {
      updated_by: string;
      updated_at: string;
      mode?: "test" | "live";
      webhook_url_override?: string | null;
    } = { updated_by: user.id, updated_at: new Date().toISOString() };
    if (data.mode === "test" || data.mode === "live") patch.mode = data.mode;
    if (data.webhookUrlOverride !== undefined) {
      const v = (data.webhookUrlOverride ?? "").trim();
      patch.webhook_url_override = v.length > 0 ? v : null;
    }
    const { error } = await supabaseAdmin
      .from("platform_billing_config")
      .update(patch)
      .eq("id", 1);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: "config_updated",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      metadata: { mode: data.mode ?? null, webhook_override_set: data.webhookUrlOverride !== undefined },
    });

    return { ok: true };
  });

export type PlatformBillingHealthResult = {
  ok: boolean;
  message: string;
  mollieMode: "test" | "live" | "unknown" | null;
  checkedAt: string;
};

/**
 * Safe live ping against Mollie's /v2/methods endpoint with the platform key.
 * Does NOT create payments. Logs result to activity_log so we can show "last test status".
 */
async function persistHealth(status: "ok" | "failed", message: string, mode: string | null) {
  await supabaseAdmin
    .from("platform_billing_config")
    .update({
      last_health_status: status,
      last_health_message: message,
      last_health_mode: mode,
      last_health_at: new Date().toISOString(),
    })
    .eq("id", 1);
}

export const runPlatformBillingHealthCheck = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }): Promise<PlatformBillingHealthResult> => {
    const user = await assertSuperAdmin(data.accessToken);
    const apiKey = process.env.MOLLIE_API_KEY;
    const checkedAt = new Date().toISOString();

    if (!apiKey) {
      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "health_check_failed",
        actor_user_id: user.id,
        actor_email: user.email ?? null,
        metadata: { error: "MOLLIE_API_KEY is not configured" },
      });
      await persistHealth("failed", "MOLLIE_API_KEY is not configured", null);
      return {
        ok: false,
        message: "MOLLIE_API_KEY is not configured",
        mollieMode: null,
        checkedAt,
      };
    }

    const mode: "test" | "live" | "unknown" = apiKey.startsWith("test_")
      ? "test"
      : apiKey.startsWith("live_")
        ? "live"
        : "unknown";

    try {
      const res = await fetch("https://api.mollie.com/v2/methods?resource=payments", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        await supabaseAdmin.from("activity_log").insert({
          entity: BILLING_ENTITY,
          action: "health_check_failed",
          actor_user_id: user.id,
          actor_email: user.email ?? null,
          metadata: { error: `Mollie ${res.status}: ${txt.slice(0, 300)}`, mode },
        });
        await persistHealth("failed", `Mollie returned ${res.status}`, mode);
        return {
          ok: false,
          message: `Mollie returned ${res.status}`,
          mollieMode: mode,
          checkedAt,
        };
      }
      const json = (await res.json()) as { count?: number };
      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "health_check_passed",
        actor_user_id: user.id,
        actor_email: user.email ?? null,
        metadata: { mode, methods_count: json.count ?? 0 },
      });
      const okMsg = `Connected to Mollie (${mode}) — ${json.count ?? 0} payment methods available`;
      await persistHealth("ok", okMsg, mode);
      return {
        ok: true,
        message: okMsg,
        mollieMode: mode,
        checkedAt,
      };
    } catch (err) {
      const message = (err as Error).message ?? "unknown error";
      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "health_check_failed",
        actor_user_id: user.id,
        actor_email: user.email ?? null,
        metadata: { error: message, mode },
      });
      await persistHealth("failed", message, mode);
      return { ok: false, message, mollieMode: mode, checkedAt };
    }
  });
