// Admin query: Mollie Connect health per shop.
//
// Pulls shop_payment_providers + recent payments to surface for super_admins:
//  - connection_status
//  - organization_name (from metadata)
//  - token_expires_at  (from metadata)
//  - last_refresh_at   (from metadata)
//  - last_refresh_error (from metadata)
//  - application_fee_cents in the last 30 days

import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ConnectionStatus } from "@/admin/providers/payment-providers";

export type MollieHealthRow = {
  provider_id: string;
  shop_id: string;
  shop_name: string;
  connection_status: ConnectionStatus;
  organization_id: string | null;
  organization_name: string | null;
  token_expires_at: string | null;
  last_refresh_at: string | null;
  last_refresh_error: string | null;
  application_fee_cents_30d: number;
  payments_30d: number;
  connected_at: string | null;
  last_synced_at: string | null;
};

export const adminMollieHealthQuery = () =>
  queryOptions({
    queryKey: ["admin", "mollie-health"],
    queryFn: async (): Promise<MollieHealthRow[]> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [providersRes, paymentsRes] = await Promise.all([
        (supabase as any)
          .from("shop_payment_providers")
          .select("id, shop_id, connection_status, metadata, connected_at, last_synced_at")
          .eq("provider", "mollie"),
        supabase
          .from("payments")
          .select("shop_id, application_fee_cents")
          .gte("created_at", since),
      ]);

      if (providersRes.error) throw providersRes.error;

      const rows = (providersRes.data ?? []) as Array<{
        id: string;
        shop_id: string;
        connection_status: ConnectionStatus;
        metadata: Record<string, unknown> | null;
        connected_at: string | null;
        last_synced_at: string | null;
      }>;

      // Aggregate fees per shop over last 30 days.
      const feeByShop = new Map<string, { fees: number; count: number }>();
      ((paymentsRes.data ?? []) as Array<{ shop_id: string; application_fee_cents: number }>).forEach((p) => {
        const cur = feeByShop.get(p.shop_id) ?? { fees: 0, count: 0 };
        cur.fees += p.application_fee_cents ?? 0;
        cur.count += 1;
        feeByShop.set(p.shop_id, cur);
      });

      const shopIds = [...new Set(rows.map((r) => r.shop_id))];
      const shopsRes = shopIds.length
        ? await supabase.from("shops").select("id, name").in("id", shopIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const shopMap = new Map(((shopsRes as any).data ?? []).map((s: any) => [s.id, s.name as string]));

      return rows
        .map<MollieHealthRow>((r) => {
          const meta = (r.metadata ?? {}) as Record<string, unknown>;
          const fees = feeByShop.get(r.shop_id);
          return {
            provider_id: r.id,
            shop_id: r.shop_id,
            shop_name: (shopMap.get(r.shop_id) as string) ?? "—",
            connection_status: r.connection_status,
            organization_id: (meta.organization_id as string | null) ?? null,
            organization_name: (meta.organization_name as string | null) ?? null,
            token_expires_at: (meta.token_expires_at as string | null) ?? null,
            last_refresh_at: (meta.last_refresh_at as string | null) ?? null,
            last_refresh_error: (meta.last_refresh_error as string | null) ?? null,
            application_fee_cents_30d: fees?.fees ?? 0,
            payments_30d: fees?.count ?? 0,
            connected_at: r.connected_at,
            last_synced_at: r.last_synced_at,
          };
        })
        .sort((a, b) => {
          // Errors and expired tokens first; then by fees desc.
          const aBad = a.last_refresh_error ? 2 : isExpired(a.token_expires_at) ? 1 : 0;
          const bBad = b.last_refresh_error ? 2 : isExpired(b.token_expires_at) ? 1 : 0;
          if (aBad !== bBad) return bBad - aBad;
          return b.application_fee_cents_30d - a.application_fee_cents_30d;
        });
    },
    staleTime: 30_000,
  });

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < Date.now();
}
