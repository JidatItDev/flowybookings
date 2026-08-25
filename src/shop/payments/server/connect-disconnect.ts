// Disconnect a shop's Mollie Connect link. Owner-only.
// Caller: POST /api/mollie-connect/disconnect with JSON body { shop_id }
// We mark the row as disconnected and clear the access_token. We intentionally
// do NOT call Mollie's revoke endpoint by default to preserve refund history;
// the merchant can revoke the app from their Mollie dashboard if they prefer.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveShopAccessDecision } from "@/shop/payments/server/shop-access-decision";
import { createLogger } from "@/server/logger";

const log = createLogger("mollie_connect.disconnect");

export const handlers = {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = (await request.json().catch(() => null)) as { shop_id?: string } | null;
          const shopId = body?.shop_id;
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!shopId) return json({ error: "missing_shop_id" }, 400);
          if (!token) return json({ error: "unauthenticated" }, 401);

          const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
          const userId = userRes.user.id;

          const { data: shop } = await supabaseAdmin
            .from("shops")
            .select("id, owner_id")
            .eq("id", shopId)
            .maybeSingle();
          if (!shop) return json({ error: "shop_not_found" }, 404);
          if (shop.owner_id !== userId) {
            const { data: roles } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", userId);
            const decision = resolveShopAccessDecision({
              shopOwnerId: shop.owner_id,
              callerId: userId,
              roles: (roles ?? []).map((r) => r.role),
            });
            if (decision === "forbidden") return json({ error: "forbidden" }, 403);
          }

          const { data: row } = await supabaseAdmin
            .from("shop_payment_providers")
            .select("id, metadata")
            .eq("shop_id", shopId)
            .eq("provider", "mollie")
            .maybeSingle();
          if (!row) return json({ ok: true, already_disconnected: true });

          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          const cleanedMeta = {
            ...meta,
            access_token: null,
            refresh_token: null,
            access_token_enc: null,
            refresh_token_enc: null,
            token_expires_at: null,
          };

          const { error: updateErr } = await supabaseAdmin
            .from("shop_payment_providers")
            .update({
              connection_status: "disconnected",
              onboarding_status: "not_started",
              provider_account_id: null,
              connected_at: null,
              last_synced_at: null,
              disconnected_at: new Date().toISOString(),
              metadata: cleanedMeta,
            })
            .eq("id", row.id);
          if (updateErr) {
            log.error("update_failed", { shop_id: shopId, err: updateErr });
            return json({ error: "update_failed", details: updateErr.message }, 500);
          }

          await supabaseAdmin.from("activity_log").insert({
            entity: "mollie_connect",
            action: "mollie_disconnected",
            shop_id: shopId,
            actor_user_id: userId,
            actor_email: userRes.user.email ?? null,
            metadata: {
              provider: "mollie",
              previous_status: row ? "connected" : "unknown",
            },
          });

          log.info("disconnected", { shop_id: shopId, user_id: userId });
          return json({ ok: true });
        } catch (err) {
          log.error("unhandled_error", { err });
          return json({ error: "internal_error", details: (err as Error).message }, 500);
        }
      },
    };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
