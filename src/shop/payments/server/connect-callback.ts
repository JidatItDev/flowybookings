// Step 2 of OAuth: Mollie redirects here with ?code=...&state=...
// We exchange the code for an access_token + refresh_token, fetch the connected
// organization profile, persist everything on shop_payment_providers, and then
// 302 the user back to /shop/payments.
//
// This route is GET (browser redirect), and is unauthenticated from our side —
// security comes from the one-time `state` token we wrote during /authorize.

import { redirect } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MOLLIE_CONNECT_API_BASE,
  MOLLIE_CONNECT_TOKEN_URL,
  encryptToken,
} from "@/shop/payments/mollie-connect";

export const handlers = {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");
        const origin = url.origin;
        const redirectBack = (status: "ok" | "error", reason?: string) => {
          const u = new URL("/shop/payments", origin);
          u.searchParams.set("mollie_connect", status);
          if (reason) u.searchParams.set("reason", reason);
          return Response.redirect(u.toString(), 302);
        };

        if (errorParam) return redirectBack("error", errorParam);
        if (!code || !state) return redirectBack("error", "missing_params");

        const clientId = process.env.MOLLIE_CONNECT_CLIENT_ID;
        const clientSecret = process.env.MOLLIE_CONNECT_CLIENT_SECRET;
        if (!clientId || !clientSecret) return redirectBack("error", "not_configured");

        // Find the row whose metadata contains this state (atomic-ish lookup).
        const { data: rows, error: lookupErr } = await supabaseAdmin
          .from("shop_payment_providers")
          .select("id, shop_id, metadata")
          .eq("provider", "mollie")
          .eq("connection_status", "pending");
        if (lookupErr) {
          console.error("[mollie-connect/callback] lookup error", lookupErr);
          return redirectBack("error", "lookup_failed");
        }
        const row = (rows ?? []).find((r) => {
          const meta = (r.metadata ?? {}) as Record<string, unknown>;
          return meta.oauth_state === state;
        });
        if (!row) return redirectBack("error", "invalid_state");

        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const redirectUri = (meta.oauth_redirect_uri as string | undefined) ??
          `${origin}/api/mollie-connect/callback`;

        // Exchange code → tokens
        const tokenRes = await fetch(MOLLIE_CONNECT_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }).toString(),
        });
        if (!tokenRes.ok) {
          const txt = await tokenRes.text();
          console.error("[mollie-connect/callback] token exchange failed", tokenRes.status, txt);
          await supabaseAdmin
            .from("shop_payment_providers")
            .update({
              connection_status: "error",
              metadata: { ...meta, oauth_error: txt, oauth_state: null },
            })
            .eq("id", row.id);
          return redirectBack("error", "token_exchange_failed");
        }
        const tokens = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          token_type?: string;
          scope?: string;
        };

        // Fetch the connected organization to display a friendly name.
        let orgId: string | null = null;
        let orgName: string | null = null;
        let profileId: string | null = null;
        try {
          const orgRes = await fetch(`${MOLLIE_CONNECT_API_BASE}/organizations/me`, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (orgRes.ok) {
            const org = (await orgRes.json()) as { id?: string; name?: string };
            orgId = org.id ?? null;
            orgName = org.name ?? null;
          }
        } catch (e) {
          console.warn("[mollie-connect/callback] org fetch failed", e);
        }
        try {
          const profileRes = await fetch(`${MOLLIE_CONNECT_API_BASE}/profiles?limit=1`, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (profileRes.ok) {
            const data = (await profileRes.json()) as {
              _embedded?: { profiles?: Array<{ id?: string }> };
            };
            profileId = data._embedded?.profiles?.[0]?.id ?? null;
          }
        } catch (e) {
          console.warn("[mollie-connect/callback] profile fetch failed", e);
        }

        const expiresAt = tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null;

        const accessEnc = await encryptToken(tokens.access_token);
        const refreshEnc = tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null;

        const newMeta = {
          ...meta,
          // Encrypted at rest (AES-CBC + IV via pgcrypto, key in Vault).
          access_token_enc: accessEnc,
          refresh_token_enc: refreshEnc,
          // Strip any legacy plaintext fields from older versions of this code.
          access_token: null,
          refresh_token: null,
          token_expires_at: expiresAt,
          organization_id: orgId,
          organization_name: orgName,
          profile_id: profileId,
          scopes: tokens.scope ?? null,
          oauth_state: null,
          oauth_state_created_at: null,
          oauth_error: null,
          last_refresh_at: null,
          last_refresh_error: null,
          // Force the user to verify in the UI that they picked the right
          // Mollie organisation. Cleared to `true` by the confirmation step.
          connection_confirmed: false,
          confirmed_at: null,
        };

        await supabaseAdmin
          .from("shop_payment_providers")
          .update({
            connection_status: "connected",
            onboarding_status: "completed",
            provider_account_id: orgId,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
            last_synced_at: new Date().toISOString(),
            metadata: newMeta,
          })
          .eq("id", row.id);

        await supabaseAdmin.from("activity_log").insert({
          entity: "mollie_connect",
          action: "connected",
          shop_id: row.shop_id,
          metadata: { organization_id: orgId, organization_name: orgName },
        });

        await supabaseAdmin.from("notifications").insert({
          shop_id: row.shop_id,
          type: "billing",
          title: "Mollie gekoppeld",
          message: orgName
            ? `Je Mollie-account "${orgName}" is succesvol gekoppeld. Je kunt nu aanbetalingen ontvangen.`
            : "Je Mollie-account is succesvol gekoppeld. Je kunt nu aanbetalingen ontvangen.",
          action_url: "/shop/payments",
          metadata: { kind: "mollie_connect", subkind: "connected" },
        });

        return redirectBack("ok");
      },
    };
