import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLATFORM_PROVIDER } from "@/admin/settings/platform-billing";
import { getMolliePlatformKeys, mollieFetchWithFallback } from "@/shared/lib/mollie-platform";
import { serverEnv } from "@/server/env";
import { processMolliePaymentNotification } from "@/shop/payments/server/mollie-webhook";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.reconcile");

function cronAuthorized(request: Request): boolean {
  const cronSecret = serverEnv("CRON_SECRET");
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (cronSecret) return got === cronSecret;
  const allowed = [
    serverEnv("SUPABASE_SERVICE_ROLE_KEY"),
    serverEnv("SUPABASE_ANON_KEY"),
    serverEnv("SUPABASE_PUBLISHABLE_KEY"),
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
      .select("id, plan, plan_expires_at, subscription_status, mollie_customer_id")
      .eq("subscription_status", "active")
      .in("plan", ["starter", "pro", "premium"])
      .not("plan_expires_at", "is", null)
      .lt("plan_expires_at", horizon);

    if (error) return json({ error: "fetch_failed", detail: error.message }, 500);

    let replayed = 0;
    let skipped = 0;
    for (const shop of shops ?? []) {
      const customerId = shop.mollie_customer_id;
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

        try {
          const result = await processMolliePaymentNotification(p.id, "received");
          if (result.ingested === true || result.local_status === "paid") {
            replayed++;
            log.info("reconcile_replayed", { shop_id: shop.id, mollie_id: p.id });
          } else {
            log.warn("reconcile_skip", {
              shop_id: shop.id,
              mollie_id: p.id,
              ingested: result.ingested,
              local_status: result.local_status,
            });
          }
        } catch (err) {
          log.error("reconcile_replay_failed", { shop_id: shop.id, mollie_id: p.id, err });
        }
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
