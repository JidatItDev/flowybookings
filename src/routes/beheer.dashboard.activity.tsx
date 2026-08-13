import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/admin/activity/ActivityPage";

export const Route = createFileRoute("/beheer/dashboard/activity")({
  head: () => ({ meta: [{ title: "Activiteit — Platform" }] }),
  component: ActivityPage,
});
