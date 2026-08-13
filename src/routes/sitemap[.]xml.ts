import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/site/lib/sitemap";

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers },
});
