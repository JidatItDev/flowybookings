import { createFileRoute } from "@tanstack/react-router";
import { BeheerLoginPage } from "@/admin/login/LoginPage";

export const Route = createFileRoute("/beheer/ad/login")({
  head: () => ({ meta: [{ title: "Platform login" }] }),
  component: BeheerLoginPage,
});
