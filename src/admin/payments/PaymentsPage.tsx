import { useMemo, useState } from "react";
import { CircleDollarSign, TrendingUp, RotateCcw, Wallet, Plug, CheckCircle2, AlertCircle, Loader2, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/admin/shell/AdminLayout";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { adminPaymentsQuery, adminStatsQuery, adminShopsQuery } from "@/admin/shared/admin-queries";
import { adminPaymentProvidersQuery, paymentProviderKeys, type ConnectionStatus } from "@/admin/providers/payment-providers";
import { MollieHealthPanel } from "@/admin/payments/MollieHealthPanel";
import { formatCents, relativeFromNow } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

const STATUS_FILTERS = ["all", "paid", "unpaid", "deposit_paid", "refunded", "failed"] as const;
const PLAN_FILTERS = ["all", "trial", "starter", "pro", "premium"] as const;
const KIND_FILTERS = ["all", "subscription", "booking"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type PlanFilter = (typeof PLAN_FILTERS)[number];
type KindFilter = (typeof KIND_FILTERS)[number];

export function AdminPaymentsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useQuery(adminStatsQuery());
  const { data: payments, isLoading } = useQuery(adminPaymentsQuery());
  const { data: providers, isLoading: providersLoading } = useQuery(adminPaymentProvidersQuery());
  const { data: shops } = useQuery(adminShopsQuery());

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");

  const planByShop = useMemo(() => {
    const m = new Map<string, string>();
    (shops ?? []).forEach((s) => m.set(s.id, s.plan));
    return m;
  }, [shops]);

  const visiblePayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (payments ?? []).filter((p) => {
      // Kind: subscription = platform_mollie + no booking; booking = anything else.
      const isSubscription = p.provider === "platform_mollie" && p.booking_id === null;
      if (kindFilter === "subscription" && !isSubscription) return false;
      if (kindFilter === "booking" && isSubscription) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (planFilter !== "all" && planByShop.get(p.shop_id) !== planFilter) return false;
      if (q && !(p.shop_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [payments, statusFilter, planFilter, kindFilter, search, planByShop]);

  const refundedCount = visiblePayments.filter((p) => p.status === "refunded").length;
  const refundedAmount = visiblePayments.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount_cents, 0);

  // Per-shop revenue + fee rollup (uses filtered payments so admin can scope)
  const perShop = new Map<string, { name: string; revenue: number; fees: number; count: number }>();
  visiblePayments.forEach((p) => {
    const key = p.shop_id;
    const cur = perShop.get(key) ?? { name: p.shop_name ?? "—", revenue: 0, fees: 0, count: 0 };
    cur.revenue += p.amount_cents;
    cur.fees += p.application_fee_cents;
    cur.count += 1;
    perShop.set(key, cur);
  });
  const perShopRows = [...perShop.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.fees - a.fees)
    .slice(0, 10);

  const setStatus = useMutation({
    mutationFn: async ({ id, shop_id, status }: { id?: string; shop_id: string; status: ConnectionStatus }) => {
      const patch: Record<string, unknown> = {
        connection_status: status,
        onboarding_status: status === "connected" ? "completed" : status === "pending" ? "in_review" : "not_started",
        connected_at: status === "connected" ? new Date().toISOString() : null,
        disconnected_at: status === "disconnected" ? new Date().toISOString() : null,
      };
      if (id) {
        const { error } = await (supabase as any).from("shop_payment_providers").update(patch).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("shop_payment_providers").upsert(
          { shop_id, provider: "mollie", application_fee_enabled: true, application_fee_percent: 2.0, ...patch },
          { onConflict: "shop_id,provider" },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("adminProviders.updated"));
      qc.invalidateQueries({ queryKey: paymentProviderKeys.adminAll() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <PageHeader title={t("adminPayments.title")} description={t("adminPayments.description")} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {statsLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />) : (
          <>
            <StatCard label={t("adminPayments.totalRevenue")} value={formatCents(stats?.totalRevenue ?? 0)} trend="up" icon={CircleDollarSign} accent="primary" />
            <StatCard label={t("adminPayments.platformFees")} value={formatCents(stats?.totalFees ?? 0)} trend="up" icon={TrendingUp} accent="mint" />
            <StatCard label={t("adminPayments.totalTransactions")} value={String(payments?.length ?? 0)} trend="neutral" icon={Wallet} accent="peach" />
            <StatCard label={t("adminPayments.refunds")} value={formatCents(refundedAmount)} delta={t("adminPayments.events", { n: refundedCount })} trend="neutral" icon={RotateCcw} accent="pink" />
          </>
        )}
      </div>

      {/* Mollie Connect — provider status per shop */}
      <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("adminProviders.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("adminProviders.description")}</p>
          </div>
          <span className="flex-none rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">Mollie Connect</span>
        </div>
        {providersLoading ? (
          <div className="space-y-2 p-4 sm:p-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (providers ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">{t("adminProviders.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {(providers ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.shop_name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("adminProviders.account")}: {p.provider_account_id ?? "—"} · {t("adminProviders.fee")}: {p.application_fee_enabled ? `${p.application_fee_percent}%` : t("common.no")}
                  </p>
                </div>
                <ProviderStatusPill status={p.connection_status} />
                <div className="flex flex-none gap-1.5">
                  {p.connection_status !== "connected" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: p.id, shop_id: p.shop_id, status: "connected" })} disabled={setStatus.isPending}>
                      {t("adminProviders.markConnected")}
                    </Button>
                  )}
                  {p.connection_status !== "disconnected" && p.connection_status !== "not_connected" && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: p.id, shop_id: p.shop_id, status: "disconnected" })} disabled={setStatus.isPending}>
                      {t("adminProviders.disconnect")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mollie Connect — health overview (token / refresh / fees 30d) */}
      <MollieHealthPanel />


      {!isLoading && perShopRows.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <h2 className="text-base font-semibold">{t("adminProviders.revenueByShop")}</h2>
            <p className="text-xs text-muted-foreground">{t("adminProviders.revenueByShopDesc")}</p>
          </div>
          <ul className="divide-y divide-border">
            {perShopRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{t("adminPayments.events", { n: r.count })}</p>
                </div>
                <div className="flex flex-none items-center gap-4 text-right">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("adminPayments.totalRevenue")}</p>
                    <p className="text-sm font-semibold">{formatCents(r.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("adminPayments.platformFees")}</p>
                    <p className="text-sm font-semibold text-primary">{formatCents(r.fees)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="space-y-3 border-b border-border px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{t("adminPayments.allTransactions")}</h2>
              <span className="text-xs text-muted-foreground">{t("adminPayments.events", { n: visiblePayments.length })}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 sm:max-w-xs">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("adminPayments.searchShop")}
                  className="h-full flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                      statusFilter === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === "all" ? t("adminBilling.filter.all") : s.replace("_", " ")}
                  </button>
                ))}
              </div>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                className="h-8 rounded-full border border-primary/40 bg-primary-soft px-3 text-[11px] font-semibold text-primary"
                aria-label={t("adminPayments.kindLabel")}
              >
                {KIND_FILTERS.map((k) => (
                  <option key={k} value={k}>
                    {t(`adminPayments.kind.${k}`)}
                  </option>
                ))}
              </select>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
                className="h-8 rounded-full border border-border bg-card px-3 text-[11px] font-medium"
              >
                {PLAN_FILTERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "all" ? t("adminPayments.allPlans") : p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-4 py-3 text-left sm:px-6">{t("adminPayments.shop")}</th><th className="px-4 py-3 text-left sm:px-6">{t("adminPayments.amount")}</th><th className="hidden px-6 py-3 text-left md:table-cell">{t("adminPayments.fee")}</th><th className="px-4 py-3 text-left sm:px-6">{t("adminPayments.status")}</th><th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminPayments.provider")}</th><th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminPayments.date")}</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {visiblePayments.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("adminPayments.noPayments")}</td></tr>}
              {visiblePayments.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-4 font-medium sm:px-6">{p.shop_name ?? "—"}</td>
                  <td className="px-4 py-4 font-medium sm:px-6">{formatCents(p.amount_cents, p.currency)}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{formatCents(p.application_fee_cents, p.currency)}</td>
                  <td className="px-4 py-4 sm:px-6"><StatusBadge status={p.status} /></td>
                  <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{p.provider ?? "—"}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground xl:table-cell">{relativeFromNow(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
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
    <span className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {t(`mollie.status.${status}`)}
    </span>
  );
}
