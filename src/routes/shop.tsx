// Parent layout for all /shop/* routes. Keeps RequireShopAccess + chrome mounted
// across sibling navigations (calendar → customers → …). Onboarding stays outside
// the chrome — it must not hit ShopLayout's empty-shops redirect loop.

import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { ShopLayout } from "@/shop/shell/ShopLayout";

export const Route = createFileRoute("/shop")({
  component: ShopRouteLayout,
});

function ShopRouteLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/shop/onboarding") {
    return <Outlet />;
  }
  return (
    <ShopLayout>
      <Outlet />
    </ShopLayout>
  );
}
