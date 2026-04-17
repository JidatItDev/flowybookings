import { createFileRoute } from "@tanstack/react-router";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/shop/settings")({
  head: () => ({ meta: [{ title: "Settings — Bookly" }] }),
  component: SettingsPage,
});

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function SettingsPage() {
  return (
    <ShopLayout>
      <PageHeader
        title="Shop settings"
        description="Brand, hours, booking rules and timezone."
        actions={<Button variant="hero">Save changes</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Shop profile" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shop name" defaultValue="Inkwell Studio" />
            <Field label="Phone" defaultValue="+49 30 5550 1010" />
            <Field label="Email" defaultValue="hello@inkwell.io" />
            <Field label="Timezone" defaultValue="Europe/Berlin" />
            <div className="sm:col-span-2">
              <Field label="Address" defaultValue="Friedrichstraße 102, 10117 Berlin, Germany" />
            </div>
          </div>
        </Card>

        <Card title="Branding">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand text-xl font-semibold text-primary-foreground">
              IS
            </div>
            <div>
              <Button variant="outline" size="sm">Upload logo</Button>
              <p className="mt-2 text-xs text-muted-foreground">PNG or SVG · max 2MB.</p>
            </div>
          </div>
          <div className="mt-5">
            <Field label="Brand color" defaultValue="#7C5CFA" />
          </div>
        </Card>

        <Card title="Business hours" className="lg:col-span-2">
          <div className="space-y-2">
            {days.map((d, i) => (
              <div key={d} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <span className="text-sm font-medium">{d}</span>
                <span className="text-xs text-muted-foreground">
                  {i === 6 ? "Closed" : "9:00 — 18:00"}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Booking rules">
          <Field label="Min. notice (hours)" defaultValue="2" />
          <div className="mt-3"><Field label="Max booking window (days)" defaultValue="60" /></div>
          <div className="mt-3"><Field label="Slot interval (min)" defaultValue="15" /></div>
          <div className="mt-3"><Field label="Default deposit %" defaultValue="20" /></div>
        </Card>
      </div>
    </ShopLayout>
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
      <input
        defaultValue={defaultValue}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
