import { createFileRoute } from "@tanstack/react-router";
import { SupportLayout, LegalSection, CompanyFootnote } from "@/components/SupportLayout";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — FlowyBookings" },
      { name: "description", content: "Terms and conditions for using FlowyBookings." },
      { property: "og:title", content: "Terms & Conditions — FlowyBookings" },
      { property: "og:description", content: "Terms and conditions for using FlowyBookings." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <SupportLayout title="Terms & Conditions">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <LegalSection>
          <p>By using FlowyBookings, you agree to the following:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>You are responsible for the information you provide</li>
            <li>Shops are responsible for their services and bookings</li>
            <li>FlowyBookings is not liable for disputes between customers and shops</li>
            <li>Payments are processed via Mollie</li>
          </ul>
        </LegalSection>

        <LegalSection>
          <p>We reserve the right to suspend accounts in case of misuse.</p>
        </LegalSection>

        <LegalSection heading="Company">
          <p>
            FlowyBookings
            <br />
            KvK: 69444552
          </p>
        </LegalSection>
      </div>
      <CompanyFootnote />
    </SupportLayout>
  );
}
