// Step 1 of OAuth: redirect the shop owner to Mollie's authorize endpoint.
// Caller: GET /api/mollie-connect/authorize?shop_id=<uuid>
// We verify the caller owns the shop, then write a one-time `state` token into
// shop_payment_providers.metadata so the callback can validate it (CSRF guard)
// and resolve which shop to attach the access_token to.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MOLLIE_CONNECT_AUTHORIZE_URL,
  MOLLIE_CONNECT_SCOPES,
} from "@/shop/payments/mollie-connect";

export const handlers = {
      GET: async ({ request }: { request: Request }) => {
        try {
          const url = new URL(request.url);
          const shopId = url.searchParams.get("shop_id");
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!shopId) return json({ error: "missing_shop_id" }, 400);
          if (!token) return json({ error: "unauthenticated" }, 401);

          const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
          if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);
          const userId = userRes.user.id;

          // Owner or super_admin only
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
            const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
            if (!isAdmin) return json({ error: "forbidden" }, 403);
          }

          const clientId = process.env.MOLLIE_CONNECT_CLIENT_ID;
          if (!clientId) return json({ error: "mollie_connect_not_configured" }, 503);

          // Generate state and stash it on the row (creates row if missing).
          const state = crypto.randomUUID();
          const origin = url.origin;
          const redirectUri = `${origin}/api/mollie-connect/callback`;

          // Upsert row with pending status + state token in metadata
          const { error: upsertErr } = await supabaseAdmin
            .from("shop_payment_providers")
            .upsert(
              {
                shop_id: shopId,
                provider: "mollie",
                connection_status: "pending",
                onboarding_status: "in_review",
                metadata: {
                  oauth_state: state,
                  oauth_state_created_at: new Date().toISOString(),
                  oauth_redirect_uri: redirectUri,
                },
              },
              { onConflict: "shop_id,provider" },
            );
          if (upsertErr) return json({ error: "db_error", details: upsertErr.message }, 500);

          const authorizeUrl = new URL(MOLLIE_CONNECT_AUTHORIZE_URL);
          authorizeUrl.searchParams.set("client_id", clientId);
          authorizeUrl.searchParams.set("redirect_uri", redirectUri);
          authorizeUrl.searchParams.set("state", state);
          authorizeUrl.searchParams.set("scope", MOLLIE_CONNECT_SCOPES);
          authorizeUrl.searchParams.set("response_type", "code");
          authorizeUrl.searchParams.set("approval_prompt", "auto");

          return json({ ok: true, authorize_url: authorizeUrl.toString() });
        } catch (err) {
          console.error("[mollie-connect/authorize]", err);
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
