// Scheduled hook (cron) — refresh Mollie Connect access tokens for every shop
// whose token is expired or expiring soon. Triggered every 4 hours by pg_cron.
//
// Auth: caller must present the project's anon key as Bearer + Lovable-Context: cron.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  decryptToken,
  encryptToken,
  refreshMollieTokens,
} from "@/shop/payments/mollie-connect";

const REFRESH_AHEAD_MS = 6 * 60 * 60 * 1000; // refresh anything expiring in next 6h

export const handlers = {
      POST: async ({ request }: { request: Request }) => {
        // Auth: require either Lovable-Context: cron + anon key, or service role.
        const cronSecret = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        const ctx = request.headers.get("lovable-context") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        const expectedAnon = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        const isService = token === (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
        const isCronSecret = !!cronSecret && token === cronSecret;
        const isLegacyCron = ctx === "cron" && expectedAnon && token === expectedAnon;
        if (!isService && !isCronSecret && !isLegacyCron) {
          return json({ error: "unauthenticated" }, 401);
        }

        const cutoff = new Date(Date.now() + REFRESH_AHEAD_MS).toISOString();
        const { data: rows, error } = await supabaseAdmin
          .from("shop_payment_providers")
          .select("id, shop_id, metadata")
          .eq("provider", "mollie")
          .eq("connection_status", "connected");
        if (error) return json({ error: "lookup_failed", details: error.message }, 500);

        let refreshed = 0;
        let skipped = 0;
        let failed = 0;
        for (const row of rows ?? []) {
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          const refreshEnc = meta.refresh_token_enc as string | undefined;
          const expiresAt = meta.token_expires_at as string | undefined;
          if (!refreshEnc) {
            skipped++;
            continue;
          }
          if (expiresAt && expiresAt > cutoff) {
            skipped++;
            continue;
          }
          try {
            const refresh = await decryptToken(refreshEnc);
            if (!refresh) {
              failed++;
              continue;
            }
            const fresh = await refreshMollieTokens(refresh);
            const newAccess = await encryptToken(fresh.access_token);
            const newRefresh = fresh.refresh_token
              ? await encryptToken(fresh.refresh_token)
              : refreshEnc;
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
          } catch (err) {
            failed++;
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

        return json({ ok: true, refreshed, skipped, failed, total: rows?.length ?? 0 });
      },
    };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
