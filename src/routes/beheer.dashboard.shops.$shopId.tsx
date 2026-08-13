import { createFileRoute } from "@tanstack/react-router";
import { ShopDetailPage } from "@/admin/shops/ShopDetailPage";

export const Route = createFileRoute("/beheer/dashboard/shops/$shopId")({
  head: () => ({ meta: [{ title: "Shop detail — Platform" }] }),
  component: ShopDetailPage,
});
