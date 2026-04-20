import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarIcon, Download, Store, X } from "lucide-react";
import { format } from "date-fns";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import {
  ADMIN_ACTIVITY_LIMIT,
  activityToCsv,
  adminActivityLogQuery,
  downloadCsv,
  type AdminActivityEvent,
} from "@/lib/admin-activity-query";

export const Route = createFileRoute("/beheer/dashboard/activity")({
  head: () => ({ meta: [{ title: "Activiteit — Platform" }] }),
  component: ActivityPage,
});

const PAGE_SIZE = 50;

const ALL = "__all__";

function ActivityPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(adminActivityLogQuery());

  const [actionFilter, setActionFilter] = useState<string>(ALL);
  const [shopFilter, setShopFilter] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(1);

  // Realtime: nieuwe events → invalidate
  useEffect(() => {
    const channel = supabase
      .channel("admin-activity-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        () => qc.invalidateQueries({ queryKey: ["admin", "activity-log-full"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const events = data ?? [];

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.action));
    return [...set].sort();
  }, [events]);

  const shopOptions = useMemo(() => {
    const map = new Map<string, string>();
    events.forEach((e) => {
      if (e.shop_id) map.set(e.shop_id, e.shop_name ?? e.shop_id.slice(0, 8));
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [events]);

  const filtered = useMemo(() => {
    // Inclusief hele dag voor 'tot' (eind van dag) en vanaf 00:00 voor 'van'.
    const fromMs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
    const toMs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
    return events.filter((e) => {
      if (actionFilter !== ALL && e.action !== actionFilter) return false;
      if (shopFilter !== ALL && e.shop_id !== shopFilter) return false;
      if (fromMs !== null || toMs !== null) {
        const ts = new Date(e.created_at).getTime();
        if (fromMs !== null && ts < fromMs) return false;
        if (toMs !== null && ts > toMs) return false;
      }
      return true;
    });
  }, [events, actionFilter, shopFilter, dateFrom, dateTo]);

  // Reset paginatie als filters wijzigen
  useEffect(() => {
    setPage(1);
  }, [actionFilter, shopFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const handleExport = () => {
    const csv = activityToCsv(filtered);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadCsv(`activity-log-${stamp}.csv`, csv);
  };

  return (
    <AdminLayout>
      <PageHeader
        title={t("activityPage.title")}
        description={t("activityPage.subtitle").replace("{limit}", String(ADMIN_ACTIVITY_LIMIT))}
        actions={
          <Button onClick={handleExport} disabled={filtered.length === 0} className="gap-2">
            <Download className="h-4 w-4" />
            {t("activityPage.exportCsv")}
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("activityPage.filterAction")}
            </span>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("activityPage.allActions")}</SelectItem>
                {actionOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("activityPage.filterShop")}
            </span>
            <Select value={shopFilter} onValueChange={setShopFilter}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("activityPage.allShops")}</SelectItem>
                {shopOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("activityPage.filterDateFrom")}
            </span>
            <DatePickerButton
              value={dateFrom}
              onChange={setDateFrom}
              placeholder={t("activityPage.pickDate")}
              maxDate={dateTo}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("activityPage.filterDateTo")}
            </span>
            <DatePickerButton
              value={dateTo}
              onChange={setDateTo}
              placeholder={t("activityPage.pickDate")}
              minDate={dateFrom}
            />
          </div>

          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1 text-muted-foreground"
              onClick={() => {
                setDateFrom(undefined);
                setDateTo(undefined);
              }}
            >
              <X className="h-3.5 w-3.5" />
              {t("activityPage.clearDates")}
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {t("activityPage.resultsCount")
            .replace("{shown}", String(filtered.length))
            .replace("{total}", String(events.length))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Activity className="h-4 w-4 text-muted-foreground" />
            {t("activityPage.tableTitle")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("activityPage.pageOf")
              .replace("{page}", String(safePage))
              .replace("{total}", String(totalPages))}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            {t("activityPage.empty")}
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">{t("activityPage.col.time")}</TableHead>
                  <TableHead>{t("activityPage.col.action")}</TableHead>
                  <TableHead>{t("activityPage.col.shop")}</TableHead>
                  <TableHead>{t("activityPage.col.actor")}</TableHead>
                  <TableHead>{t("activityPage.col.metadata")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((e) => (
                  <ActivityRow key={e.id} event={e} />
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border px-6 py-3">
              <span className="text-xs text-muted-foreground">
                {t("activityPage.showingRange")
                  .replace("{from}", String(pageStart + 1))
                  .replace("{to}", String(pageStart + pageItems.length))
                  .replace("{total}", String(filtered.length))}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  {t("activityPage.prev")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  {t("activityPage.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function ActivityRow({ event }: { event: AdminActivityEvent }) {
  const dt = new Date(event.created_at);
  const time = dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const metaKeys = Object.keys(event.metadata ?? {});
  const metaPreview = metaKeys.length
    ? metaKeys
        .slice(0, 3)
        .map((k) => `${k}: ${formatMetaValue(event.metadata[k])}`)
        .join(" · ")
    : "—";

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{time}</TableCell>
      <TableCell>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
          {event.action}
        </span>
        <span className="ml-2 text-xs text-muted-foreground">{event.entity}</span>
      </TableCell>
      <TableCell className="text-sm">
        {event.shop_name ? (
          <span className="inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-muted-foreground" />
            {event.shop_name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{event.actor_email ?? "—"}</TableCell>
      <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={JSON.stringify(event.metadata)}>
        {metaPreview}
      </TableCell>
    </TableRow>
  );
}

function formatMetaValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 30 ? `${v.slice(0, 30)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v).slice(0, 30);
}
