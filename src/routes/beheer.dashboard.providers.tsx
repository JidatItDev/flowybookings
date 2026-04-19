// Admin overview of every shop's BOOKING PAYMENT provider (Mollie Connect).
// Strictly separate from /beheer/dashboard/billing (subscription billing).

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plug,
  Search,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  adminPaymentProvidersQuery,
  paymentProviderKeys,
  type ConnectionStatus,
  type OnboardingStatus,
} from "@/lib/payment-providers";
import { adminShopsQuery } from "@/lib/admin-queries";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { relativeFromNow } from "@/lib/format";

export const Route = createFileRoute("/beheer/dashboard/providers")({
  head: () => ({ meta: [{ title: "Booking Payment Providers — Platform" }] }),
  component: AdminProvidersPage,
});

const STATUS_FILTERS: Array<"all" | ConnectionStatus> = [
  "all",
  "connected",
  "pending",
  "not_connected",
  "disconnected",
  "error",
];

function AdminProvidersPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: providers = [], isLoading } = useQuery(adminPaymentProvidersQuery());
  const { data: shops = [] } = useQuery(adminShopsQuery());

  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [search, setSearch] = useState("");

  // Index providers by shop so we can show "no provider yet" for shops missing a row.
  const providerByShop = useMemo(() => {
    const m = new Map<string, (typeof providers)[number]>();
    providers.forEach((p) => m.set(p.shop_id, p));
    return m;
  }, [providers]);

  // Build a unified row list: every shop, plus its provider state if any.
  type Row = {
    shop_id: string;
    shop_name: string;
    owner_email: string | null;
    provider_id: string | null;
    provider_account_id: string | null;
    connection_status: ConnectionStatus;
    onboarding_status: OnboardingStatus;
    application_fee_enabled: boolean;
    application_fee_percent: number;
    last_synced_at: string | null;
    connected_at: string | null;
  };
  const rows: Row[] = useMemo(
    () =>
      shops.map((s) => {
        const p = providerByShop.get(s.id);
        return {
          shop_id: s.id,
          shop_name: s.name,
          owner_email: s.owner_email ?? null,
          provider_id: p?.id ?? null,
          provider_account_id: p?.provider_account_id ?? null,
          connection_status: (p?.connection_status ?? "not_connected") as ConnectionStatus,
          onboarding_status: (p?.onboarding_status ?? "not_started") as OnboardingStatus,
          application_fee_enabled: p?.application_fee_enabled ?? false,
          application_fee_percent: p?.application_fee_percent ?? 0,
          last_synced_at: p?.last_synced_at ?? null,
          connected_at: p?.connected_at ?? null,
        };
      }),
    [shops, providerByShop],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.connection_status !== statusFilter) return false;
      if (q && !r.shop_name.toLowerCase().includes(q) && !(r.owner_email ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, statusFilter, search]);

  const summary = useMemo(() => {
    const connected = rows.filter((r) => r.connection_status === "connected").length;
    const pending = rows.filter((r) => r.connection_status === "pending").length;
    const errored = rows.filter((r) => r.connection_status === "error").length;
    const missing = rows.filter(
      (r) => r.connection_status === "not_connected" || r.connection_status === "disconnected",
    ).length;
    return { connected, pending, errored, missing };
  }, [rows]);

  const setStatus = useMutation({
    mutationFn: async ({
      providerId,
      shopId,
      status,
    }: {
      providerId: string | null;
      shopId: string;
      status: ConnectionStatus;
    }) => {
      const patch: Record<string, unknown> = {
        connection_status: status,
        onboarding_status:
          status === "connected" ? "completed" : status === "pending" ? "in_review" : "not_started",
        connected_at: status === "connected" ? new Date().toISOString() : null,
        disconnected_at: status === "disconnected" ? new Date().toISOString() : null,
      };
      if (providerId) {
        const { error } = await (supabase as any)
          .from("shop_payment_providers")
          .update(patch)
          .eq("id", providerId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("shop_payment_providers")
          .upsert(
            {
              shop_id: shopId,
              provider: "mollie",
              application_fee_enabled: true,
              application_fee_percent: 2.0,
              ...patch,
            },
            { onConflict: "shop_id,provider" },
          );
        if (error) throw error;
      }
      // Provider activity log entry — separate from billing entity.
      await supabase.from("activity_log").insert({
        entity: "booking_payment_provider",
        action: `marked_${status}`,
        shop_id: shopId,
        metadata: { provider: "mollie" },
      });
    },
    onSuccess: () => {
      toast.success(t("adminProviders.updated"));
      qc.invalidateQueries({ queryKey: paymentProviderKeys.adminAll() });
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <PageHeader
        title={t("adminProvidersPage.title")}
        description={t("adminProvidersPage.description")}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t("adminProvidersPage.connected")}
          value={String(summary.connected)}
          icon={CheckCircle2}
          accent="mint"
        />
        <StatCard
          label={t("adminProvidersPage.pending")}
          value={String(summary.pending)}
          icon={Loader2}
          accent="peach"
        />
        <StatCard
          label={t("adminProvidersPage.notConnected")}
          value={String(summary.missing)}
          icon={Plug}
          accent="primary"
        />
        <StatCard
          label={t("adminProvidersPage.errors")}
          value={String(summary.errored)}
          icon={AlertCircle}
          accent="pink"
        />
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 sm:max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("adminProvidersPage.searchPlaceholder")}
            className="h-full flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                statusFilter === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "all" ? t("adminBilling.filter.all") : t(`mollie.status.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Provider list */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Wallet className="h-4 w-4 text-primary" />
              {t("adminProvidersPage.shopsTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("adminProvidersPage.shopsDesc")}</p>
          </div>
          <span className="flex-none rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
            Mollie Connect
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4 sm:p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
            {t("adminProvidersPage.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <li key={r.shop_id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.shop_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.owner_email ?? "—"} · {t("adminProviders.account")}:{" "}
                    {r.provider_account_id ?? "—"} · {t("adminProviders.fee")}:{" "}
                    {r.application_fee_enabled ? `${r.application_fee_percent}%` : t("common.no")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("adminProvidersPage.onboarding")}: {t(`mollie.onboarding.${r.onboarding_status}`)}
                    {r.connected_at ? ` · ${t("adminProvidersPage.connectedAt")} ${relativeFromNow(r.connected_at)}` : ""}
                  </p>
                </div>
                <ProviderStatusPill status={r.connection_status} />
                <div className="flex flex-none gap-1.5">
                  {r.connection_status !== "connected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setStatus.mutate({
                          providerId: r.provider_id,
                          shopId: r.shop_id,
                          status: "connected",
                        })
                      }
                      disabled={setStatus.isPending}
                    >
                      {t("adminProviders.markConnected")}
                    </Button>
                  )}
                  {r.connection_status !== "disconnected" &&
                    r.connection_status !== "not_connected" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setStatus.mutate({
                            providerId: r.provider_id,
                            shopId: r.shop_id,
                            status: "disconnected",
                          })
                        }
                        disabled={setStatus.isPending}
                      >
                        {t("adminProviders.disconnect")}
                      </Button>
                    )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {t("adminProvidersPage.scopeHint")}
      </p>
    </AdminLayout>
  );
}

function ProviderStatusPill({ status }: { status: ConnectionStatus }) {
  const { t } = useT();
  const map: Record<ConnectionStatus, { cls: string; icon: React.ReactNode }> = {
    not_connected: { cls: "bg-muted text-muted-foreground", icon: <Plug className="h-3.5 w-3.5" /> },
    pending: { cls: "bg-peach text-peach-foreground", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    connected: { cls: "bg-mint text-mint-foreground", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    disconnected: { cls: "bg-muted text-muted-foreground", icon: <Plug className="h-3.5 w-3.5" /> },
    error: { cls: "bg-destructive/15 text-destructive", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.icon}
      {t(`mollie.status.${status}`)}
    </span>
  );
}
