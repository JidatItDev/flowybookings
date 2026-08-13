// Admin overzicht: SMS-saldo per shop met skipped & resumed metrics.
// Sortering standaard op "langst op 0 gestaan" (oudste sms_resumed eerst,
// shops die nooit hebben hervat maar wel gemiste sms hebben bovenaan).

import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { AlertTriangle, Search, MessageSquareWarning, RotateCcw } from "lucide-react";
import { AdminLayout } from "@/admin/shell/AdminLayout";
import { PageHeader } from "@/shared/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

type SortKey = "longest_zero" | "balance_asc" | "skipped_desc" | "name";

type Row = {
  shopId: string;
  shopName: string;
  slug: string;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  skipped30d: number;
  lastResumedAt: string | null;
  zeroSinceMs: number | null; // hoe lang op 0 in ms (null als balance > 0)
};

const adminSmsOverviewQuery = () =>
  queryOptions({
    queryKey: ["admin", "sms-overview"],
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [shopsRes, creditsRes, skippedRes, resumedRes] = await Promise.all([
        supabase.from("shops").select("id, name, slug").order("name"),
        supabase
          .from("shop_sms_credits")
          .select("shop_id, balance, total_purchased, total_used, updated_at"),
        supabase
          .from("sms_send_log")
          .select("shop_id, created_at")
          .eq("status", "skipped_no_credits")
          .gte("created_at", since),
        supabase
          .from("activity_log")
          .select("shop_id, created_at")
          .eq("entity", "sms_credits")
          .eq("action", "sms_resumed")
          .order("created_at", { ascending: false }),
      ]);

      if (shopsRes.error) throw shopsRes.error;
      if (creditsRes.error) throw creditsRes.error;
      if (skippedRes.error) throw skippedRes.error;
      if (resumedRes.error) throw resumedRes.error;

      const credits = new Map(
        (creditsRes.data ?? []).map((r) => [r.shop_id, r]),
      );
      const skippedCount = new Map<string, number>();
      for (const r of skippedRes.data ?? []) {
        if (!r.shop_id) continue;
        skippedCount.set(r.shop_id, (skippedCount.get(r.shop_id) ?? 0) + 1);
      }
      // Eerste resumed-record = meest recente per shop (al desc gesorteerd).
      const lastResumed = new Map<string, string>();
      for (const r of resumedRes.data ?? []) {
        if (!r.shop_id) continue;
        if (!lastResumed.has(r.shop_id)) lastResumed.set(r.shop_id, r.created_at);
      }

      const now = Date.now();
      const rows: Row[] = (shopsRes.data ?? []).map((s) => {
        const c = credits.get(s.id);
        const balance = c?.balance ?? 0;
        const lastResumedAt = lastResumed.get(s.id) ?? null;
        // Proxy voor "hoe lang op 0": als balance 0 is, gebruik tijd sinds
        // updated_at op shop_sms_credits (laatste mutatie). Als nooit geupdate,
        // val terug op een groot getal (oneindig lang) zodat ze hoog sorteren.
        let zeroSinceMs: number | null = null;
        if (balance <= 0) {
          if (c?.updated_at) {
            zeroSinceMs = now - new Date(c.updated_at).getTime();
          } else {
            zeroSinceMs = Number.MAX_SAFE_INTEGER;
          }
        }
        return {
          shopId: s.id,
          shopName: s.name,
          slug: s.slug,
          balance,
          totalPurchased: c?.total_purchased ?? 0,
          totalUsed: c?.total_used ?? 0,
          skipped30d: skippedCount.get(s.id) ?? 0,
          lastResumedAt,
          zeroSinceMs,
        };
      });

      return rows;
    },
    staleTime: 30_000,
  });

function formatDuration(ms: number): string {
  if (ms === Number.MAX_SAFE_INTEGER) return "∞";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}u`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function SmsPage() {
  const { t } = useT();
  const { data, isLoading } = useQuery(adminSmsOverviewQuery());
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("longest_zero");

  const rows = useMemo(() => {
    const filtered = (data ?? []).filter((r) =>
      `${r.shopName} ${r.slug}`.toLowerCase().includes(q.toLowerCase()),
    );
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "longest_zero": {
          // Shops op 0 met langste duur eerst; daarna shops met balance > 0.
          // Tiebreaker: meeste skipped30d.
          const aZero = a.zeroSinceMs ?? -1;
          const bZero = b.zeroSinceMs ?? -1;
          if (aZero !== bZero) return bZero - aZero;
          return b.skipped30d - a.skipped30d;
        }
        case "balance_asc":
          return a.balance - b.balance;
        case "skipped_desc":
          return b.skipped30d - a.skipped30d;
        case "name":
        default:
          return a.shopName.localeCompare(b.shopName);
      }
    });
    return sorted;
  }, [data, q, sort]);

  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      shopsAtZero: list.filter((r) => r.balance <= 0).length,
      totalSkipped: list.reduce((s, r) => s + r.skipped30d, 0),
      totalResumed: list.filter((r) => r.lastResumedAt).length,
    };
  }, [data]);

  return (
    <AdminLayout>
      <PageHeader
        title={t("adminSms.title")}
        description={t("adminSms.description")}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t("adminSms.shopsAtZero")}
          value={totals.shopsAtZero}
          tone={totals.shopsAtZero > 0 ? "warning" : "default"}
        />
        <StatTile
          icon={<MessageSquareWarning className="h-4 w-4" />}
          label={t("adminSms.skipped30d")}
          value={totals.totalSkipped}
          tone={totals.totalSkipped > 0 ? "warning" : "default"}
        />
        <StatTile
          icon={<RotateCcw className="h-4 w-4" />}
          label={t("adminSms.resumedShops")}
          value={totals.totalResumed}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("adminSms.searchPlaceholder")}
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {(
          [
            { key: "longest_zero", label: t("adminSms.sortLongestZero") },
            { key: "balance_asc", label: t("adminSms.sortBalanceAsc") },
            { key: "skipped_desc", label: t("adminSms.sortSkippedDesc") },
            { key: "name", label: t("adminSms.sortName") },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSort(opt.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium",
              sort === opt.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left">{t("adminSms.shop")}</th>
                <th className="px-6 py-3 text-right">{t("adminSms.balance")}</th>
                <th className="hidden px-6 py-3 text-right md:table-cell">
                  {t("adminSms.purchased")}
                </th>
                <th className="hidden px-6 py-3 text-right md:table-cell">
                  {t("adminSms.used")}
                </th>
                <th className="px-6 py-3 text-right">{t("adminSms.skipped")}</th>
                <th className="hidden px-6 py-3 text-left lg:table-cell">
                  {t("adminSms.zeroSince")}
                </th>
                <th className="hidden px-6 py-3 text-left lg:table-cell">
                  {t("adminSms.lastResumed")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    {t("adminSms.noShops")}
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const atZero = r.balance <= 0;
                return (
                  <tr key={r.shopId} className="hover:bg-muted/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-warm text-xs font-semibold text-pink-foreground">
                          {r.shopName[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <p className="font-medium">{r.shopName}</p>
                          <p className="text-xs text-muted-foreground">{r.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          atZero
                            ? "bg-destructive/15 text-destructive"
                            : r.balance < 5
                              ? "bg-warning/20 text-warning-foreground"
                              : "bg-success/15 text-success-foreground",
                        )}
                      >
                        {r.balance}
                      </span>
                    </td>
                    <td className="hidden px-6 py-4 text-right text-muted-foreground md:table-cell">
                      {r.totalPurchased}
                    </td>
                    <td className="hidden px-6 py-4 text-right text-muted-foreground md:table-cell">
                      {r.totalUsed}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={cn(
                          "font-medium",
                          r.skipped30d > 0
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {r.skipped30d}
                      </span>
                    </td>
                    <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">
                      {atZero && r.zeroSinceMs !== null ? (
                        <span className="font-medium text-destructive">
                          {formatDuration(r.zeroSinceMs)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">
                      {r.lastResumedAt ? formatDate(r.lastResumedAt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-soft",
        tone === "warning" ? "border-warning/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-tight",
          tone === "warning" && value > 0 ? "text-warning-foreground" : "",
        )}
      >
        {value}
      </p>
    </div>
  );
}
