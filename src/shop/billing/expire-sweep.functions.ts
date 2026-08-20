// Admin-only wrapper: POST /hooks/billing-expiry with CRON_SECRET.
// SSOT remains billing-expiry.ts — this only gates + proxies for BillingPage.

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { serverEnv } from "@/server/env";

export type ExpireSweepResult = {
  ok: boolean;
  ran_at: string;
  pending_applied: Array<{ shop_id: string; from: string; to: string }>;
  expired_to_starter: Array<{ shop_id: string; from: string }>;
};

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

export const runExpireSweep = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }): Promise<ExpireSweepResult> => {
    await assertSuperAdmin(data.accessToken);

    const token =
      serverEnv("CRON_SECRET") ??
      serverEnv("SUPABASE_SERVICE_ROLE_KEY") ??
      serverEnv("SUPABASE_ANON_KEY") ??
      serverEnv("SUPABASE_PUBLISHABLE_KEY");

    if (!token) {
      throw new Error("Missing CRON_SECRET / Supabase key for billing-expiry auth");
    }

    const { getRequest } = await import("@tanstack/react-start/server");
    let origin = (serverEnv("APP_URL") ?? serverEnv("PUBLIC_APP_URL") ?? "").replace(/\/$/, "");
    try {
      const req = getRequest();
      if (!origin) origin = new URL(req.url).origin;
    } catch {
      /* keep APP_URL */
    }
    if (!origin) {
      throw new Error("Missing APP_URL (or request origin) for billing-expiry");
    }

    const res = await fetch(`${origin}/hooks/billing-expiry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Sweep failed (${res.status}): ${text || res.statusText}`);
    }

    const body = (await res.json()) as Partial<ExpireSweepResult> & { error?: string };
    return {
      ok: body.ok !== false,
      ran_at: body.ran_at ?? new Date().toISOString(),
      pending_applied: body.pending_applied ?? [],
      expired_to_starter: body.expired_to_starter ?? [],
    };
  });
