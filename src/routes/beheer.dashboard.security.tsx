import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/admin/security/SecurityPage";

export const Route = createFileRoute("/beheer/dashboard/security")({
  head: () => ({ meta: [{ title: "Security & Access — Admin" }] }),
  component: SecurityPage,
});
