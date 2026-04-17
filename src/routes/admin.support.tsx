import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { supportTickets } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/support")({
  head: () => ({ meta: [{ title: "Support — Admin" }] }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <AdminLayout>
      <PageHeader title="Support tickets" description="Shop and payment issues — assigned and unassigned." actions={<Button variant="hero">New ticket</Button>} />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 text-left">Subject</th>
              <th className="hidden px-6 py-3 text-left md:table-cell">Shop</th>
              <th className="px-6 py-3 text-left">Priority</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="hidden px-6 py-3 text-left lg:table-cell">Updated</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {supportTickets.map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <td className="px-6 py-4 font-medium">{t.subject}</td>
                <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{t.shop}</td>
                <td className="px-6 py-4"><StatusBadge status={t.priority} /></td>
                <td className="px-6 py-4"><StatusBadge status={t.status} /></td>
                <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{t.updated}</td>
                <td className="px-6 py-4 text-right"><Button variant="ghost" size="sm">Open</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
