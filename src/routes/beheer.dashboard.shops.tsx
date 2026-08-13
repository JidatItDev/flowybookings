import { createFileRoute } from "@tanstack/react-router";
import { ShopsPage } from "@/admin/shops/ShopsPage";

export const Route = createFileRoute("/beheer/dashboard/shops")({ head: () => ({ meta: [{ title: "Shops — Platform" }] }), component: ShopsPage });
