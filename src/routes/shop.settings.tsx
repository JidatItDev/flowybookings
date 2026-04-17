import { createFileRoute } from "@tanstack/react-router";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop/settings")({
  head: () => ({ meta: [{ title: "Settings — Bookly" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useT();
  const dayKeys = ["settings.monday", "settings.tuesday", "settings.wednesday", "settings.thursday", "settings.friday", "settings.saturday", "settings.sunday"];

  return (
    <ShopLayout>
      <PageHeader title={t("settings.title")} description={t("settings.description")} actions={<Button variant="hero">{t("settings.saveChanges")}</Button>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t("settings.shopProfile")} className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.shopName")} defaultValue="Inkwell Studio" />
            <Field label={t("settings.phone")} defaultValue="+49 30 5550 1010" />
            <Field label={t("settings.email")} defaultValue="hello@inkwell.io" />
            <Field label={t("settings.timezone")} defaultValue="Europe/Berlin" />
            <div className="sm:col-span-2"><Field label={t("settings.address")} defaultValue="Friedrichstraße 102, 10117 Berlin, Germany" /></div>
          </div>
        </Card>
        <Card title={t("settings.branding")}>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand text-xl font-semibold text-primary-foreground">IS</div>
            <div>
              <Button variant="outline" size="sm">{t("settings.uploadLogo")}</Button>
              <p className="mt-2 text-xs text-muted-foreground">{t("settings.logoHint")}</p>
            </div>
          </div>
          <div className="mt-5"><Field label={t("settings.brandColor")} defaultValue="#7C5CFA" /></div>
        </Card>
        <Card title={t("settings.businessHours")} className="lg:col-span-2">
          <div className="space-y-2">
            {dayKeys.map((dk, i) => (
              <div key={dk} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <span className="text-sm font-medium">{t(dk)}</span>
                <span className="text-xs text-muted-foreground">{i === 6 ? t("settings.closed") : "9:00 — 18:00"}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={t("settings.bookingRules")}>
          <Field label={t("settings.minNotice")} defaultValue="2" />
          <div className="mt-3"><Field label={t("settings.maxWindow")} defaultValue="60" /></div>
          <div className="mt-3"><Field label={t("settings.slotInterval")} defaultValue="15" /></div>
          <div className="mt-3"><Field label={t("settings.defaultDeposit")} defaultValue="20" /></div>
        </Card>
      </div>
    </ShopLayout>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (<div className={`rounded-2xl border border-border bg-card p-6 shadow-soft ${className}`}><h2 className="mb-4 text-base font-semibold">{title}</h2>{children}</div>);
}

function Field({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (<div><label className="mb-1.5 block text-sm font-medium">{label}</label><input defaultValue={defaultValue} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" /></div>);
}
