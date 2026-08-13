import { createFileRoute } from "@tanstack/react-router";
import { PlansPage } from "@/admin/plans/PlansPage";

export const Route = createFileRoute("/beheer/dashboard/plans")({
  head: () => ({ meta: [{ title: "Plans — Admin" }] }),
  component: PlansPage,
});
