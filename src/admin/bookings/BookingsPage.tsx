import { useMemo, useState } from "react";

import { Search, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/admin/shell/AdminLayout";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminBookingsQuery } from "@/admin/shared/admin-queries";
import { downloadCsv, toCsv } from "@/admin/revenue/admin-queries-revenue";
import { formatCents, formatDateTime } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

export function BookingsPage() {
  const { t } = useT();
  const [q, setQ] = useState(""); const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: bookings, isLoading } = useQuery(adminBookingsQuery());
  const statuses = ["all", "pending", "confirmed", "completed", "cancelled", "no_show"];
  const list = useMemo(() => (bookings ?? []).filter((b) => {
    const matchQ = (b.customer_name ?? b.service_name ?? b.shop_name ?? "").toLowerCase().includes(q.toLowerCase());
    const matchS = statusFilter === "all" || b.status === statusFilter;
    return matchQ && matchS;
  }), [bookings, q, statusFilter]);

  const exportCsv = () => {
    const csv = toCsv(
      list.map((b) => ({
        when: formatDateTime(b.starts_at),
        shop: b.shop_name ?? "",
        customer: b.customer_name ?? "",
        service: b.service_name ?? "",
        staff: b.staff_name ?? "",
        status: b.status,
        payment_status: b.payment_status ?? "",
        price_eur: (b.price_cents / 100).toFixed(2),
        currency: b.currency,
      })),
      [
        { key: "when", label: "Wanneer" },
        { key: "shop", label: "Shop" },
        { key: "customer", label: "Klant" },
        { key: "service", label: "Dienst" },
        { key: "staff", label: "Medewerker" },
        { key: "status", label: "Boekingsstatus" },
        { key: "payment_status", label: "Betaalstatus" },
        { key: "price_eur", label: "Prijs (EUR)" },
        { key: "currency", label: "Valuta" },
      ],
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`flowybookings-bookings-${stamp}.csv`, csv);
  };

  return (
    <AdminLayout>
      <PageHeader
        title={t("adminBookings.title")}
        description={t("adminBookings.description")}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={list.length === 0}>
            <Download className="h-4 w-4" /> CSV exporteren
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adminBookings.searchPlaceholder")} className="h-10 flex-1 bg-transparent text-sm outline-none" /></div>
        {statuses.map((s) => <button key={s} onClick={() => setStatusFilter(s)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium capitalize", statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>{s === "no_show" ? "No-show" : s}</button>)}
      </div>
      {isLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div> : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-6 py-3 text-left">{t("adminBookings.booking")}</th><th className="hidden px-6 py-3 text-left md:table-cell">{t("adminBookings.shop")}</th><th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminBookings.when")}</th><th className="px-6 py-3 text-left">{t("adminBookings.status")}</th><th className="hidden px-6 py-3 text-left md:table-cell">{t("adminBookings.payment")}</th><th className="px-6 py-3 text-left">{t("adminBookings.total")}</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("adminBookings.noBookings")}</td></tr>}
              {list.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4"><p className="font-medium">{b.customer_name ?? t("adminBookings.walkIn")}</p><p className="text-xs text-muted-foreground">{b.service_name ?? "—"} · {b.staff_name ?? "Geen medewerker toegewezen"}</p></td>
                  <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{b.shop_name ?? "—"}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{formatDateTime(b.starts_at)}</td>
                  <td className="px-6 py-4"><StatusBadge status={b.status} /></td>
                  <td className="hidden px-6 py-4 md:table-cell">{b.payment_status ? <StatusBadge status={b.payment_status} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  <td className="px-6 py-4 font-medium">{formatCents(b.price_cents, b.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
