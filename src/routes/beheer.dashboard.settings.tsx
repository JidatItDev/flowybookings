import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/beheer/dashboard/settings")({
  head: () => ({ meta: [{ title: "Platform settings — Admin" }] }),
  component: AdminSettings,
});

function AdminSettings() {
  return (
    <AdminLayout>
      <PageHeader title="Platform settings" description="Branding, templates and global defaults." actions={<Button variant="hero">Save changes</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Branding">
          <Field label="Platform name" defaultValue="Bookly" />
          <div className="mt-3"><Field label="Support email" defaultValue="support@bookly.io" /></div>
          <div className="mt-3"><Field label="Brand color" defaultValue="#7C5CFA" /></div>
        </Card>
        <Card title="Booking defaults">
          <Field label="Default slot interval (min)" defaultValue="15" />
          <div className="mt-3"><Field label="Min notice (hours)" defaultValue="2" /></div>
          <div className="mt-3"><Field label="Max booking window (days)" defaultValue="60" /></div>
        </Card>
        <Card title="Email templates" className="lg:col-span-2">
          <ul className="divide-y divide-border">
            {["Booking confirmation", "24-hour reminder", "2-hour reminder", "No-show follow-up", "Refund issued"].map((t) => (
              <li key={t} className="flex items-center justify-between py-3 text-sm">
                <span className="font-medium">{t}</span>
                <Button variant="ghost" size="sm">Edit template</Button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Legal">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between"><span>Terms of service</span><Button variant="ghost" size="sm">Edit</Button></li>
            <li className="flex items-center justify-between"><span>Privacy policy</span><Button variant="ghost" size="sm">Edit</Button></li>
            <li className="flex items-center justify-between"><span>Acceptable use</span><Button variant="ghost" size="sm">Edit</Button></li>
          </ul>
        </Card>
        <Card title="Danger zone">
          <p className="text-sm text-muted-foreground">Maintenance mode, data export, account deletion.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm">Enable maintenance</Button>
            <Button variant="destructive" size="sm">Export all data</Button>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-6 shadow-soft ${className}`}>
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <input defaultValue={defaultValue} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
    </div>
  );
}
