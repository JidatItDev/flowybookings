import { createFileRoute } from "@tanstack/react-router";
import { SupportLayout, LegalSection, CompanyFootnote } from "@/components/SupportLayout";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — FlowyBookings" },
      { name: "description", content: "How FlowyBookings collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy — FlowyBookings" },
      { property: "og:description", content: "How FlowyBookings collects, uses, and protects your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <SupportLayout title="Privacy Policy">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <LegalSection>
          <p>
            FlowyBookings respects your privacy. We collect only the data necessary to provide our
            booking and payment services.
          </p>
        </LegalSection>

        <LegalSection heading="Data we collect">
          <ul className="ml-4 list-disc space-y-1">
            <li>Account information (name, email)</li>
            <li>Booking data</li>
            <li>Payment-related data via Mollie (we do NOT store payment details)</li>
          </ul>
        </LegalSection>

        <LegalSection heading="We use this data to">
          <ul className="ml-4 list-disc space-y-1">
            <li>Provide and improve our platform</li>
            <li>Process bookings and payments</li>
            <li>Communicate with users</li>
          </ul>
        </LegalSection>

        <LegalSection heading="Sharing">
          <p>
            We do not sell or share your data with third parties, except where necessary for
            payment processing (Mollie).
          </p>
        </LegalSection>

        <LegalSection heading="Contact">
          <p>
            <a href="mailto:support@flowybookings.com" className="text-primary hover:underline">
              support@flowybookings.com
            </a>
          </p>
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
