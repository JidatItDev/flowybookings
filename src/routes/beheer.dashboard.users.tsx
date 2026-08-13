import { createFileRoute } from "@tanstack/react-router";
import { UsersPage } from "@/admin/users/UsersPage";

export const Route = createFileRoute("/beheer/dashboard/users")({
  head: () => ({ meta: [{ title: "Users — Platform" }] }),
  component: UsersPage,
});
