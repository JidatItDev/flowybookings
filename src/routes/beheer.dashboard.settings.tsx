import { createFileRoute } from "@tanstack/react-router";
import { PlatformBillingCard } from "@/admin/settings/PlatformBillingCard";
import { PlanConfigurationCard } from "@/admin/settings/PlanConfigurationCard";
import { AdminSettingsPage } from "@/admin/settings/SettingsPage";

export const Route = createFileRoute("/beheer/dashboard/settings")({
  head: () => ({ meta: [{ title: "Platform settings — Admin" }] }),
  component: AdminSettingsPage,
});
