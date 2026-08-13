import { createFileRoute } from "@tanstack/react-router";
import { LEGAL_LAST_UPDATED } from "@/site/lib/legal-meta";
import { PrivacyPage } from "@/site/legal/PrivacyPage";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — FlowyBookings" },
      { name: "description", content: "How FlowyBookings collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy — FlowyBookings" },
      { property: "og:description", content: "How FlowyBookings collects, uses, and protects your data." },
      { property: "og:url", content: "https://www.flowybookings.com/legal/privacy" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "https://www.flowybookings.com/legal/privacy" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Privacy Policy — FlowyBookings",
          url: "https://www.flowybookings.com/legal/privacy",
          description: "How FlowyBookings collects, uses, and protects your data.",
          isPartOf: { "@type": "WebSite", url: "https://www.flowybookings.com" },
          publisher: { "@type": "Organization", name: "FlowyBookings", url: "https://www.flowybookings.com" },
        }),
      },
    ],
  }),
  component: PrivacyPage,
});
