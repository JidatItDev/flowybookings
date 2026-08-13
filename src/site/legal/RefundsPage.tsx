import { SupportLayout, LegalSection, CompanyFootnote } from "@/site/support/SupportLayout";
import { useT } from "@/shared/lib/i18n";
import { LEGAL_LAST_UPDATED } from "@/site/lib/legal-meta";

export function RefundsPage() {
  const { t } = useT();
  return (
    <SupportLayout title={t("legal.refunds.title")} lastUpdated={LEGAL_LAST_UPDATED.refunds}>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <LegalSection>
          <p>{t("legal.refunds.line1")}</p>
          <p>{t("legal.refunds.line2")}</p>
        </LegalSection>

        <LegalSection heading={t("legal.refunds.subHeading")}>
          <ul className="ml-4 list-disc space-y-1">
            <li>{t("legal.refunds.sub1")}</li>
          </ul>
        </LegalSection>

        <LegalSection heading={t("legal.contact")}>
          <p>
            <a href="mailto:support@flowybookings.com" className="text-primary hover:underline">
              support@flowybookings.com
            </a>
          </p>
        </LegalSection>
      </div>
      <CompanyFootnote />
    </SupportLayout>
  );
}
