// Scheduled hook (cron) — refresh Mollie Connect access tokens for every shop
// whose token is expired or expiring soon. Triggered every 4 hours by pg_cron.
//
// Auth: shared with billing-expiry/billing-reconcile — see @/server/cron-auth.
// Prefers vault-stored CRON_SECRET; falls back to service-role/anon/publishable
// key if CRON_SECRET isn't configured.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  decryptToken,
  encryptToken,
  refreshMollieTokens,
} from "@/shop/payments/mollie-connect";
import { cronAuthorized } from "@/server/cron-auth";
import { planTokenRefresh } from "@/shop/payments/server/mollie-token-decision";
import { createLogger } from "@/server/logger";

const log = createLogger("mollie_connect.refresh_tokens");

const REFRESH_AHEAD_MS = 6 * 60 * 60 * 1000; // refresh anything expiring in next 6h

export const handlers = {
      POST: async ({ request }: { request: Request }) => {
        if (!cronAuthorized(request)) {
          return json({ error: "unauthenticated" }, 401);
        }

        const { data: rows, error } = await supabaseAdmin
          .from("shop_payment_providers")
          .select("id, shop_id, metadata")
          .eq("provider", "mollie")
          .eq("connection_status", "connected");
        if (error) {
          log.error("lookup_failed", { err: error });
          return json({ error: "lookup_failed", details: error.message }, 500);
        }

        const plan = planTokenRefresh(rows ?? [], Date.now(), REFRESH_AHEAD_MS);
        const planById = new Map(plan.map((p) => [p.id, p]));

        log.info("cron_start", { total: rows?.length ?? 0 });

        let refreshed = 0;
        let skipped = 0;
        let failed = 0;
        for (const row of rows ?? []) {
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          const item = planById.get(row.id);
          if (!item || item.action !== "refresh") {
            skipped++;
            log.debug("skipped", { shop_id: row.shop_id, provider_id: row.id, reason: item?.action ?? "unknown" });
            continue;
          }
          try {
            const refresh = await decryptToken(item.refreshTokenEnc);
            if (!refresh) {
              failed++;
              log.error("decrypt_failed", { shop_id: row.shop_id, provider_id: row.id });
              continue;
            }
            const fresh = await refreshMollieTokens(refresh);
            const newAccess = await encryptToken(fresh.access_token);
            const newRefresh = fresh.refresh_token
              ? await encryptToken(fresh.refresh_token)
              : item.refreshTokenEnc;
            await supabaseAdmin
              .from("shop_payment_providers")
              .update({
                metadata: {
                  ...meta,
                  access_token_enc: newAccess,
                  refresh_token_enc: newRefresh,
                  token_expires_at: fresh.expires_at,
                  scopes: fresh.scope ?? (meta.scopes as string | null) ?? null,
                  last_refresh_at: new Date().toISOString(),
                  last_refresh_error: null,
                } as never,
                last_synced_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            refreshed++;
            log.info("refreshed", { shop_id: row.shop_id, provider_id: row.id, new_expires_at: fresh.expires_at });
          } catch (err) {
            failed++;
            log.error("refresh_failed", { shop_id: row.shop_id, provider_id: row.id, err });
            await supabaseAdmin
              .from("shop_payment_providers")
              .update({
                metadata: {
                  ...meta,
                  last_refresh_error: (err as Error).message,
                  last_refresh_at: new Date().toISOString(),
                },
              })
              .eq("id", row.id);
          }
        }

        await supabaseAdmin.from("activity_log").insert({
          entity: "mollie_connect_refresh",
          action: "cron_run",
          metadata: { refreshed, skipped, failed, total: rows?.length ?? 0 },
        });

        log.info("cron_done", { refreshed, skipped, failed, total: rows?.length ?? 0 });
        return json({ ok: true, refreshed, skipped, failed, total: rows?.length ?? 0 });
      },
    };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
