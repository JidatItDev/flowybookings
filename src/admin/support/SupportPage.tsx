import { AdminLayout } from "@/admin/shell/AdminLayout";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { supportTickets } from "@/admin/support/mock-data";
import { useT } from "@/shared/lib/i18n";

export function AdminSupportPage() {
  const { t } = useT();
  return (
    <AdminLayout>
      <PageHeader title={t("adminSupport.title")} description={t("adminSupport.description")} actions={<Button variant="hero">{t("adminSupport.newTicket")}</Button>} />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>
            <th className="px-6 py-3 text-left">{t("adminSupport.subject")}</th><th className="hidden px-6 py-3 text-left md:table-cell">{t("adminSupport.shop")}</th><th className="px-6 py-3 text-left">{t("adminSupport.priority")}</th><th className="px-6 py-3 text-left">{t("adminSupport.status")}</th><th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminSupport.updated")}</th><th className="px-6 py-3" />
          </tr></thead>
          <tbody className="divide-y divide-border">
            {supportTickets.map((tk) => (
              <tr key={tk.id} className="hover:bg-muted/30">
                <td className="px-6 py-4 font-medium">{tk.subject}</td>
                <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{tk.shop}</td>
                <td className="px-6 py-4"><StatusBadge status={tk.priority} /></td>
                <td className="px-6 py-4"><StatusBadge status={tk.status} /></td>
                <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{tk.updated}</td>
                <td className="px-6 py-4 text-right"><Button variant="ghost" size="sm">{t("adminSupport.open")}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
