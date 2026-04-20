import { createFileRoute, Link } from "@tanstack/react-router";
import { Plug, Receipt } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { PlatformBillingCard } from "@/components/PlatformBillingCard";
import { PlanConfigurationCard } from "@/components/admin/PlanConfigurationCard";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/beheer/dashboard/settings")({
  head: () => ({ meta: [{ title: "Platform settings — Admin" }] }),
  component: AdminSettings,
});

function AdminSettings() {
  const { t } = useT();
  const emailTemplates = [
    "emailTemplate.bookingConfirmation",
    "emailTemplate.reminder24",
    "emailTemplate.reminder2",
    "emailTemplate.noShowFollowUp",
    "emailTemplate.refundIssued",
  ];

  return (
    <AdminLayout>
      <PageHeader
        title={t("adminSettings.title")}
        description={t("adminSettings.description")}
        actions={<Button variant="hero">{t("adminSettings.saveChanges")}</Button>}
      />

      {/* Payments separation banner */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-primary/30 bg-primary-soft/40 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4 text-primary" /> {t("platformBilling.sectionA")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("platformBilling.sectionADesc")}</p>
        </div>
        <Link
          to="/beheer/dashboard/providers"
          className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Plug className="h-4 w-4 text-mint" /> {t("platformBilling.sectionB")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("platformBilling.sectionBDesc")}</p>
        </Link>
      </div>

      {/* Plan & feature configuration — full width above the rest */}
      <div className="mb-6">
        <PlanConfigurationCard />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Platform subscription billing — admin only */}
        <PlatformBillingCard />

        <Card title={t("adminSettings.branding")}>
          <Field label={t("adminSettings.platformName")} defaultValue="FlowyBookings" />
          <div className="mt-3">
            <Field label={t("adminSettings.supportEmail")} defaultValue="support@flowybookings.com" />
          </div>
          <div className="mt-3">
            <Field label={t("adminSettings.brandColor")} defaultValue="#7C5CFA" />
          </div>
        </Card>
        <Card title={t("adminSettings.bookingDefaults")}>
          <Field label={t("adminSettings.slotInterval")} defaultValue="15" />
          <div className="mt-3">
            <Field label={t("adminSettings.minNotice")} defaultValue="2" />
          </div>
          <div className="mt-3">
            <Field label={t("adminSettings.maxWindow")} defaultValue="60" />
          </div>
        </Card>
        <Card title={t("adminSettings.emailTemplates")} className="lg:col-span-2">
          <ul className="divide-y divide-border">
            {emailTemplates.map((k) => (
              <li key={k} className="flex items-center justify-between py-3 text-sm">
                <span className="font-medium">{t(k)}</span>
                <Button variant="ghost" size="sm">
                  {t("adminSettings.editTemplate")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("adminSettings.legal")}>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>{t("adminSettings.termsOfService")}</span>
              <Button variant="ghost" size="sm">
                {t("adminPlans.edit")}
              </Button>
            </li>
            <li className="flex items-center justify-between">
              <span>{t("adminSettings.privacyPolicy")}</span>
              <Button variant="ghost" size="sm">
                {t("adminPlans.edit")}
              </Button>
            </li>
            <li className="flex items-center justify-between">
              <span>{t("adminSettings.acceptableUse")}</span>
              <Button variant="ghost" size="sm">
                {t("adminPlans.edit")}
              </Button>
            </li>
          </ul>
        </Card>
        <Card title={t("adminSettings.dangerZone")}>
          <p className="text-sm text-muted-foreground">{t("adminSettings.dangerDesc")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              {t("adminSettings.enableMaintenance")}
            </Button>
            <Button variant="destructive" size="sm">
              {t("adminSettings.exportData")}
            </Button>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
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
