import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/auth/lib/auth-context";
import { LandingPage } from "@/site/landing/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowyBookings — Modern boekingsplatform voor dienstverleners" },
      { name: "description", content: "Boekingen, betalingen, herinneringen en statistieken voor tattooshops, kappers, nagelsalons, beautystudio's en trimsalons. Mollie, iDEAL en Bancontact ingebouwd." },
      { property: "og:title", content: "FlowyBookings — Modern boekingsplatform voor dienstverleners" },
      { property: "og:description", content: "Boekingen, betalingen en herinneringen — gebouwd voor zaken in de Benelux." },
      { property: "og:url", content: "https://www.flowybookings.com/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.flowybookings.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "FlowyBookings — Modern boekingsplatform voor dienstverleners",
          url: "https://www.flowybookings.com/",
          description:
            "Boekingen, betalingen, herinneringen en statistieken voor tattooshops, kappers, nagelsalons, beautystudio's en trimsalons.",
          inLanguage: "nl-NL",
          isPartOf: { "@type": "WebSite", url: "https://www.flowybookings.com" },
          publisher: { "@type": "Organization", name: "FlowyBookings", url: "https://www.flowybookings.com" },
        }),
      },
    ],
  }),
  component: LandingPage,
});
