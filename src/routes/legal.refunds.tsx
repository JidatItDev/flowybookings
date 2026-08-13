import { createFileRoute } from "@tanstack/react-router";
import { LEGAL_LAST_UPDATED } from "@/site/lib/legal-meta";
import { RefundsPage } from "@/site/legal/RefundsPage";

export const Route = createFileRoute("/legal/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — FlowyBookings" },
      { name: "description", content: "How refunds are handled on FlowyBookings." },
      { property: "og:title", content: "Refund Policy — FlowyBookings" },
      { property: "og:description", content: "How refunds are handled on FlowyBookings." },
      { property: "og:url", content: "https://www.flowybookings.com/legal/refunds" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "https://www.flowybookings.com/legal/refunds" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Refund Policy — FlowyBookings",
          url: "https://www.flowybookings.com/legal/refunds",
          description: "How refunds are handled on FlowyBookings.",
          isPartOf: { "@type": "WebSite", url: "https://www.flowybookings.com" },
          publisher: { "@type": "Organization", name: "FlowyBookings", url: "https://www.flowybookings.com" },
        }),
      },
    ],
  }),
  component: RefundsPage,
});
