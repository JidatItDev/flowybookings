import { createFileRoute } from "@tanstack/react-router";
import { DemoPage } from "@/site/landing/DemoPage";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Live demo — FlowyBookings" },
      { name: "description", content: "Boek een afspraak in onder 60 seconden in onze live demo." },
    ],
  }),
  component: DemoPage,
});
