import { createFileRoute } from "@tanstack/react-router";
import { Store, CreditCard, CalendarRange } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { auditLogs } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({ meta: [{ title: "Audit logs — Admin" }] }),
  component: LogsPage,
});

const icon = (t: string) => (t === "shop" ? Store : t === "payment" ? CreditCard : CalendarRange);
const color = (t: string) =>
  t === "shop" ? "bg-primary-soft text-primary" : t === "payment" ? "bg-mint text-mint-foreground" : "bg-peach text-peach-foreground";

function LogsPage() {
  return (
    <AdminLayout>
      <PageHeader title="Audit log" description="Every important admin and system action." />
      <div className="rounded-2xl border border-border bg-card p-2 shadow-soft">
        <ol className="relative">
          {auditLogs.map((l, i) => {
            const Icon = icon(l.type);
            return (
              <li key={l.id} className="flex gap-4 px-4 py-4">
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color(l.type)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 border-b border-dashed border-border pb-4 last:border-b-0">
                  <p className="text-sm">
                    <span className="font-medium">{l.actor}</span>{" "}
                    <span className="text-muted-foreground">{l.action.toLowerCase()}</span>{" "}
                    <span className="font-medium">{l.target}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{l.time}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </AdminLayout>
  );
}
