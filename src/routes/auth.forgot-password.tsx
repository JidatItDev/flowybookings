import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/auth/pages/ForgotPasswordPage";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — FlowyBookings" }] }),
  component: ForgotPasswordPage,
});
