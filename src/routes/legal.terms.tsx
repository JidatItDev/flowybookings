import { createFileRoute } from "@tanstack/react-router";
import { LEGAL_LAST_UPDATED } from "@/site/lib/legal-meta";
import { TermsPage } from "@/site/legal/TermsPage";

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
