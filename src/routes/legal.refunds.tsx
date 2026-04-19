import { createFileRoute } from "@tanstack/react-router";
import { SupportLayout, LegalSection, CompanyFootnote } from "@/components/SupportLayout";

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
  return (
    <SupportLayout title="Refund Policy">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <LegalSection>
          <p>Refunds are handled by the individual shop unless stated otherwise.</p>
          <p>
            FlowyBookings does not process refunds directly, as payments are handled via Mollie and
            the shop.
          </p>
        </LegalSection>

        <LegalSection heading="For subscription plans">
          <ul className="ml-4 list-disc space-y-1">
            <li>Payments are non-refundable unless required by law</li>
          </ul>
        </LegalSection>

        <LegalSection heading="Contact">
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
