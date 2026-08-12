import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for /book and its children (/book/$slug, /book/confirmation/$bookingId).
 * Must render <Outlet /> so slug/confirmation pages are visible.
 */
export const Route = createFileRoute("/book")({
  component: BookLayout,
});

function BookLayout() {
  return <Outlet />;
}
