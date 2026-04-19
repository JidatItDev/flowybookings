import { createFileRoute } from "@tanstack/react-router";
import { SupportLayout, LegalSection, CompanyFootnote } from "@/components/SupportLayout";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/legal/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — FlowyBookings" },
      { name: "description", content: "How refunds are handled on FlowyBookings." },
      { property: "og:title", content: "Refund Policy — FlowyBookings" },
      { property: "og:description", content: "How refunds are handled on FlowyBookings." },
    ],
  }),
  component: RefundsPage,
});

function RefundsPage() {
  const { t } = useT();
  return (
    <SupportLayout title={t("legal.refunds.title")}>
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
