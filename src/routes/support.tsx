import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "@/site/support/SupportPage";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — FlowyBookings" },
      { name: "description", content: "Help, FAQ, contact, and legal information for FlowyBookings." },
      { property: "og:title", content: "Support — FlowyBookings" },
      { property: "og:description", content: "Help, FAQ, contact, and legal information for FlowyBookings." },
    ],
  }),
  component: SupportPage,
});
