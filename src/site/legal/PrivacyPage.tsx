import { SupportLayout, LegalSection, CompanyFootnote } from "@/site/support/SupportLayout";
import { useT } from "@/shared/lib/i18n";
import { LEGAL_LAST_UPDATED } from "@/site/lib/legal-meta";

export function PrivacyPage() {
  const { t } = useT();
  return (
    <SupportLayout title={t("legal.privacy.title")} lastUpdated={LEGAL_LAST_UPDATED.privacy}>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <LegalSection>
          <p>{t("legal.privacy.intro")}</p>
        </LegalSection>

        <LegalSection heading={t("legal.privacy.collectHeading")}>
          <ul className="ml-4 list-disc space-y-1">
            <li>{t("legal.privacy.collect1")}</li>
            <li>{t("legal.privacy.collect2")}</li>
            <li>{t("legal.privacy.collect3")}</li>
          </ul>
        </LegalSection>

        <LegalSection heading={t("legal.privacy.useHeading")}>
          <ul className="ml-4 list-disc space-y-1">
            <li>{t("legal.privacy.use1")}</li>
            <li>{t("legal.privacy.use2")}</li>
            <li>{t("legal.privacy.use3")}</li>
          </ul>
        </LegalSection>

        <LegalSection heading={t("legal.privacy.shareHeading")}>
          <p>{t("legal.privacy.share")}</p>
        </LegalSection>

        <LegalSection heading={t("legal.contact")}>
          <p>
            <a href="mailto:support@flowybookings.com" className="text-primary hover:underline">
              support@flowybookings.com
            </a>
          </p>
        </LegalSection>

        <LegalSection heading={t("legal.company")}>
          <p>
            {t("legal.companyLine")}
            <br />
            {t("legal.kvk")}
          </p>
        </LegalSection>
      </div>
      <CompanyFootnote />
    </SupportLayout>
  );
}
