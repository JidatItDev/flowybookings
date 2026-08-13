import { useMemo, useState } from "react";

import { Search, Download, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/admin/shell/AdminLayout";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminAllCustomersQuery,
  downloadCsv,
  toCsv,
} from "@/admin/revenue/admin-queries-revenue";
import { formatCents, formatDate, relativeFromNow } from "@/shared/lib/format";
import { useT } from "@/shared/lib/i18n";

export function AdminCustomersPage() {
  const { t } = useT();
  const { data, isLoading } = useQuery(adminAllCustomersQuery());
  const [q, setQ] = useState("");
  const [shopFilter, setShopFilter] = useState<string>("all");

  const shops = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data ?? []) m.set(c.shop_id, c.shop_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (shopFilter !== "all" && c.shop_id !== shopFilter) return false;
      if (!needle) return true;
      return (
        c.full_name.toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle) ||
        (c.phone ?? "").toLowerCase().includes(needle) ||
        c.shop_name.toLowerCase().includes(needle)
      );
    });
  }, [data, q, shopFilter]);

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((c) => ({
        name: c.full_name,
        email: c.email ?? "",
        phone: c.phone ?? "",
        shop: c.shop_name,
        visits: c.visit_count,
        spent_eur: (c.total_spent_cents / 100).toFixed(2),
        last_visit: c.last_visit_at ? formatDate(c.last_visit_at) : "",
        signed_up: formatDate(c.created_at),
      })),
      [
        { key: "name", label: "Naam" },
        { key: "email", label: "E-mail" },
        { key: "phone", label: "Telefoon" },
        { key: "shop", label: "Shop" },
        { key: "visits", label: "Bezoeken" },
        { key: "spent_eur", label: "Besteed (EUR)" },
        { key: "last_visit", label: "Laatste bezoek" },
        { key: "signed_up", label: "Aangemeld op" },
      ],
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`flowybookings-customers-${stamp}.csv`, csv);
  };

  return (
    <AdminLayout>
      <PageHeader
        title={t("adminCustomers.title")}
        description={t("adminCustomers.description")}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> {t("adminCustomers.exportCsv")}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("adminCustomers.searchPlaceholder")}
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <select
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
          aria-label={t("adminCustomers.filterByShop")}
        >
          <option value="all">{t("adminCustomers.allShops")}</option>
          {shops.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {t("adminCustomers.totalCount", { count: filtered.length })}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">{t("adminCustomers.name")}</th>
                  <th className="hidden px-6 py-3 text-left md:table-cell">{t("adminCustomers.contact")}</th>
                  <th className="px-6 py-3 text-left">{t("adminCustomers.shop")}</th>
                  <th className="hidden px-6 py-3 text-right lg:table-cell">{t("adminCustomers.visits")}</th>
                  <th className="px-6 py-3 text-right">{t("adminCustomers.spent")}</th>
                  <th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminCustomers.lastVisit")}</th>
                  <th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminCustomers.signedUp")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                      {t("adminCustomers.noResults")}
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-warm text-xs font-semibold text-pink-foreground">
                          {c.full_name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{c.full_name}</p>
                          <p className="text-xs text-muted-foreground md:hidden">{c.email ?? c.phone ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-6 py-3 text-muted-foreground md:table-cell">
                      <div className="flex flex-col">
                        <span>{c.email ?? "—"}</span>
                        {c.phone && <span className="text-xs">{c.phone}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{c.shop_name}</td>
                    <td className="hidden px-6 py-3 text-right lg:table-cell">{c.visit_count}</td>
                    <td className="px-6 py-3 text-right font-medium">{formatCents(c.total_spent_cents)}</td>
                    <td className="hidden px-6 py-3 text-muted-foreground lg:table-cell">
                      {c.last_visit_at ? relativeFromNow(c.last_visit_at) : "—"}
                    </td>
                    <td className="hidden px-6 py-3 text-muted-foreground xl:table-cell">
                      {formatDate(c.created_at)}
                    </td>
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
