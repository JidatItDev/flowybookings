import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLATFORM_PROVIDER } from "@/admin/settings/platform-billing";
import { getMolliePlatformKeys, mollieFetchWithFallback } from "@/shared/lib/mollie-platform";

function cronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (cronSecret) return got === cronSecret;
  const allowed = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  ].filter(Boolean) as string[];
  return !!got && allowed.includes(got);
}

type MollieListPayment = {
  id: string;
  status: string;
  amount?: { value: string; currency: string };
  metadata?: Record<string, unknown> | null;
  subscriptionId?: string;
};

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    if (!cronAuthorized(request)) return json({ error: "unauthorized" }, 401);
    if (getMolliePlatformKeys().length === 0) {
      return json({ ok: true, skipped: true, reason: "no_mollie_key" });
    }

    const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: shops, error } = await supabaseAdmin
      .from("shops")
      .select("id, plan, plan_expires_at, subscription_status, onboarding")
      .eq("subscription_status", "active")
      .in("plan", ["starter", "pro", "premium"])
      .not("plan_expires_at", "is", null)
      .lt("plan_expires_at", horizon);

    if (error) return json({ error: "fetch_failed", detail: error.message }, 500);

    let replayed = 0;
    let skipped = 0;
    for (const shop of shops ?? []) {
      const onboarding = (shop.onboarding ?? {}) as Record<string, unknown>;
      const customerId = onboarding.mollie_customer_id as string | undefined;
      if (!customerId) {
        skipped++;
        continue;
      }
      const result = await mollieFetchWithFallback(
        `https://api.mollie.com/v2/customers/${customerId}/payments?limit=10`,
      );
      if (!result?.response.ok) {
        skipped++;
        continue;
      }
      const body = (await result.response.json()) as { _embedded?: { payments?: MollieListPayment[] } };
      for (const p of body._embedded?.payments ?? []) {
        if (p.status !== "paid") continue;
        const { data: existing } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("provider", PLATFORM_PROVIDER)
          .eq("provider_payment_id", p.id)
          .maybeSingle();
        if (existing) continue;

        const ping = await fetch(new URL("/api/mollie/webhook", process.env.APP_URL ?? "https://www.flowybookings.com"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: p.id }),
        });
        if (ping.ok) replayed++;
      }
    }

    return json({ ok: true, shops: shops?.length ?? 0, replayed, skipped });
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
