import { SupportLayout, LegalSection, CompanyFootnote } from "@/site/support/SupportLayout";
import { useT } from "@/shared/lib/i18n";
import { LEGAL_LAST_UPDATED } from "@/site/lib/legal-meta";

export function TermsPage() {
  const { t } = useT();
  return (
    <SupportLayout title={t("legal.terms.title")} lastUpdated={LEGAL_LAST_UPDATED.terms}>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <LegalSection>
          <p>{t("legal.terms.intro")}</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>{t("legal.terms.point1")}</li>
            <li>{t("legal.terms.point2")}</li>
            <li>{t("legal.terms.point3")}</li>
            <li>{t("legal.terms.point4")}</li>
          </ul>
        </LegalSection>

        <LegalSection>
          <p>{t("legal.terms.suspend")}</p>
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
