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
  resolveMollieConnectOrigin,
} from "@/shop/payments/mollie-connect";
import {
  buildCallbackRedirectUrl,
  buildConnectedProviderMetadata,
  buildProviderErrorMetadata,
  findPendingProviderByState,
  tokenExpiresAtIso,
} from "@/shop/payments/server/connect-callback-decision";
import { createLogger } from "@/server/logger";

const log = createLogger("mollie_connect.callback");

export const handlers = {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");
        const origin = resolveMollieConnectOrigin(url.origin);
        const redirectBack = (status: "ok" | "error", reason?: string) =>
          Response.redirect(buildCallbackRedirectUrl(origin, status, reason), 302);

        if (errorParam) {
          log.warn("mollie_returned_error", { reason: errorParam });
          return redirectBack("error", errorParam);
        }
        if (!code || !state) {
          log.warn("missing_params", { has_code: !!code, has_state: !!state });
          return redirectBack("error", "missing_params");
        }

        const clientId = process.env.MOLLIE_CONNECT_CLIENT_ID;
        const clientSecret = process.env.MOLLIE_CONNECT_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          log.error("not_configured");
          return redirectBack("error", "not_configured");
        }

        // Find the row whose metadata contains this state (atomic-ish lookup).
        const { data: rows, error: lookupErr } = await supabaseAdmin
          .from("shop_payment_providers")
          .select("id, shop_id, metadata")
          .eq("provider", "mollie")
          .eq("connection_status", "pending");
        if (lookupErr) {
          log.error("lookup_failed", { err: lookupErr });
          return redirectBack("error", "lookup_failed");
        }
        const row = findPendingProviderByState(rows ?? [], state);
        if (!row) {
          log.warn("invalid_state");
          return redirectBack("error", "invalid_state");
        }

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
          log.error("token_exchange_failed", { shop_id: row.shop_id, status: tokenRes.status, body: txt });
          await supabaseAdmin
            .from("shop_payment_providers")
            .update({
              connection_status: "error",
              metadata: buildProviderErrorMetadata(meta, txt) as never,
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
        log.info("token_exchanged", { shop_id: row.shop_id, has_refresh_token: !!tokens.refresh_token });

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
            log.info("org_resolved", { shop_id: row.shop_id, organization_id: orgId, organization_name: orgName });
          }
        } catch (e) {
          log.warn("org_fetch_failed", { shop_id: row.shop_id, err: e });
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
          log.warn("profile_fetch_failed", { shop_id: row.shop_id, err: e });
        }

        try {
          const expiresAt = tokenExpiresAtIso(tokens.expires_in, Date.now());

          // Encrypted at rest (AES-CBC + IV via pgcrypto, key in Vault).
          const accessEnc = await encryptToken(tokens.access_token);
          const refreshEnc = tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null;

          const newMeta = buildConnectedProviderMetadata({
            existingMeta: meta,
            accessTokenEnc: accessEnc,
            refreshTokenEnc: refreshEnc,
            expiresAt,
            organizationId: orgId,
            organizationName: orgName,
            profileId,
            scope: tokens.scope ?? null,
          });

          await supabaseAdmin
            .from("shop_payment_providers")
            .update({
              connection_status: "connected",
              onboarding_status: "completed",
              provider_account_id: orgId,
              connected_at: new Date().toISOString(),
              disconnected_at: null,
              last_synced_at: new Date().toISOString(),
              metadata: newMeta as never,
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

          log.info("connected", { shop_id: row.shop_id, organization_id: orgId });
          return redirectBack("ok");
        } catch (err) {
          log.error("post_token_exchange_failure", { shop_id: row.shop_id, err });
          await supabaseAdmin
            .from("shop_payment_providers")
            .update({
              connection_status: "error",
              metadata: buildProviderErrorMetadata(meta, (err as Error).message) as never,
            })
            .eq("id", row.id);
          return redirectBack("error", "connect_failed");
        }
      },
    };
