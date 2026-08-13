import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/auth/pages/ResetPasswordPage";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — FlowyBookings" }] }),
  component: ResetPasswordPage,
});
