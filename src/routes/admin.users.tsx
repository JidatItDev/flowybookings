import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { platformUsers } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin" }] }),
  component: UsersPage,
});

function UsersPage() {
  return (
    <AdminLayout>
      <PageHeader title="Users" description="All platform accounts — owners, staff and customers." actions={<Button variant="hero">Invite user</Button>} />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 text-left">User</th>
              <th className="hidden px-6 py-3 text-left md:table-cell">Role</th>
              <th className="hidden px-6 py-3 text-left lg:table-cell">Linked shop</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {platformUsers.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-primary-foreground">{u.name.split(" ").map((n) => n[0]).join("")}</div>
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-6 py-4 md:table-cell"><span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{u.role}</span></td>
                <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{u.shop}</td>
                <td className="px-6 py-4"><StatusBadge status={u.status} /></td>
                <td className="px-6 py-4 text-right"><Button variant="ghost" size="sm">Manage</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
