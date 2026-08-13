import { createFileRoute } from "@tanstack/react-router";
import { LogsPage } from "@/admin/logs/LogsPage";

export const Route = createFileRoute("/beheer/dashboard/logs")({ head: () => ({ meta: [{ title: "Activity log — Platform" }] }), component: LogsPage });
