import { createFileRoute } from "@tanstack/react-router";
import { SupportLayout, LegalSection, CompanyFootnote } from "@/components/SupportLayout";
import { useT } from "@/lib/i18n";
import { LEGAL_LAST_UPDATED } from "@/lib/legal-meta";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — FlowyBookings" },
      { name: "description", content: "Terms and conditions for using FlowyBookings." },
      { property: "og:title", content: "Terms & Conditions — FlowyBookings" },
      { property: "og:description", content: "Terms and conditions for using FlowyBookings." },
      { property: "og:url", content: "https://www.flowybookings.com/legal/terms" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "https://www.flowybookings.com/legal/terms" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Terms & Conditions — FlowyBookings",
          url: "https://www.flowybookings.com/legal/terms",
          description: "Terms and conditions for using FlowyBookings.",
          isPartOf: { "@type": "WebSite", url: "https://www.flowybookings.com" },
          publisher: { "@type": "Organization", name: "FlowyBookings", url: "https://www.flowybookings.com" },
        }),
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
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
