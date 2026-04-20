// Super-admin overview: Mollie Connect health per shop.
// Shows connection status, organization, token expiry, last refresh + error,
// and application fees collected over the last 30 days.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Plug, RefreshCw, Search, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { adminMollieHealthQuery, type MollieHealthRow } from "@/lib/admin-mollie-health";
import { formatCents, relativeFromNow } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Filter = "all" | "issues" | "connected";

export function MollieHealthPanel() {
  const { t } = useT();
  const { data: rows, isLoading } = useQuery(adminMollieHealthQuery());
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === "issues" && !hasIssue(r)) return false;
      if (filter === "connected" && r.connection_status !== "connected") return false;
      if (term) {
        const blob = `${r.shop_name} ${r.organization_name ?? ""} ${r.organization_id ?? ""}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      return true;
    });
  }, [rows, filter, q]);

  const totals = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      connected: all.filter((r) => r.connection_status === "connected").length,
      issues: all.filter(hasIssue).length,
      fees30d: all.reduce((s, r) => s + r.application_fee_cents_30d, 0),
    };
  }, [rows]);

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="space-y-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("adminMollieHealth.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("adminMollieHealth.description")}</p>
          </div>
          <span className="flex-none rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
            {t("adminMollieHealth.counts", { connected: totals.connected, total: totals.total })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 sm:max-w-xs">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("adminMollieHealth.searchPlaceholder")}
              className="h-full flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "issues", "connected"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                  filter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`adminMollieHealth.filter.${f}`)}
                {f === "issues" && totals.issues > 0 && (
                  <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 text-[10px] text-destructive">
                    {totals.issues}
                  </span>
                )}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("adminMollieHealth.feesTotal30d", { amount: formatCents(totals.fees30d) })}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4 sm:p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
          {t("adminMollieHealth.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left sm:px-6">{t("adminMollieHealth.col.shop")}</th>
                <th className="px-4 py-3 text-left sm:px-6">{t("adminMollieHealth.col.status")}</th>
                <th className="hidden px-4 py-3 text-left md:table-cell sm:px-6">{t("adminMollieHealth.col.organization")}</th>
                <th className="hidden px-4 py-3 text-left lg:table-cell sm:px-6">{t("adminMollieHealth.col.token")}</th>
                <th className="hidden px-4 py-3 text-left xl:table-cell sm:px-6">{t("adminMollieHealth.col.lastRefresh")}</th>
                <th className="px-4 py-3 text-right sm:px-6">{t("adminMollieHealth.col.fees30d")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((r) => (
                <tr key={r.provider_id} className={cn("hover:bg-muted/30", r.last_refresh_error && "bg-destructive/5")}>
                  <td className="px-4 py-4 sm:px-6">
                    <div className="flex items-start gap-2">
                      <Building2 className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.shop_name}</p>
                        {r.connected_at && (
                          <p className="text-[11px] text-muted-foreground">
                            {t("adminMollieHealth.connectedAt", { when: relativeFromNow(r.connected_at) })}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <StatusPill row={r} />
                    {r.last_refresh_error && (
                      <p className="mt-1 max-w-[220px] truncate text-[11px] text-destructive" title={r.last_refresh_error}>
                        {r.last_refresh_error}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell sm:px-6">
                    <p className="truncate text-sm">{r.organization_name ?? "—"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{r.organization_id ?? "—"}</p>
                  </td>
                  <td className="hidden px-4 py-4 lg:table-cell sm:px-6">
                    <TokenCell expiresAt={r.token_expires_at} />
                  </td>
                  <td className="hidden px-4 py-4 text-muted-foreground xl:table-cell sm:px-6">
                    {r.last_refresh_at ? relativeFromNow(r.last_refresh_at) : "—"}
                  </td>
                  <td className="px-4 py-4 text-right sm:px-6">
                    <p className="font-semibold text-primary">{formatCents(r.application_fee_cents_30d)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("adminMollieHealth.payments", { n: r.payments_30d })}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function hasIssue(r: MollieHealthRow): boolean {
  if (r.last_refresh_error) return true;
  if (r.connection_status === "error") return true;
  if (r.connection_status === "connected" && r.token_expires_at) {
    const t = Date.parse(r.token_expires_at);
    if (Number.isFinite(t) && t < Date.now()) return true;
  }
  return false;
}

function StatusPill({ row }: { row: MollieHealthRow }) {
  const { t } = useT();
  const expired =
    row.token_expires_at &&
    Number.isFinite(Date.parse(row.token_expires_at)) &&
    Date.parse(row.token_expires_at) < Date.now();

  if (row.last_refresh_error || row.connection_status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        {t("adminMollieHealth.pill.error")}
      </span>
    );
  }
  if (row.connection_status === "connected" && expired) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-peach px-2.5 py-1 text-xs font-medium text-peach-foreground">
        <RefreshCw className="h-3.5 w-3.5" />
        {t("adminMollieHealth.pill.expired")}
      </span>
    );
  }
  if (row.connection_status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-mint-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("mollie.status.connected")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <Plug className="h-3.5 w-3.5" />
      {t(`mollie.status.${row.connection_status}`)}
    </span>
  );
}

function TokenCell({ expiresAt }: { expiresAt: string | null }) {
  const { t } = useT();
  if (!expiresAt) return <span className="text-xs text-muted-foreground">—</span>;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return <span className="text-xs text-muted-foreground">—</span>;
  const diff = ms - Date.now();
  const expired = diff < 0;
  const soon = diff > 0 && diff < 24 * 60 * 60 * 1000;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Clock className={cn("h-3.5 w-3.5", expired ? "text-destructive" : soon ? "text-peach-foreground" : "text-muted-foreground")} />
      <span className={cn(expired && "text-destructive font-medium", soon && "text-peach-foreground font-medium")}>
        {expired ? t("adminMollieHealth.tokenExpired", { when: relativeFromNow(expiresAt) }) : relativeFromNow(expiresAt)}
      </span>
    </div>
  );
}
