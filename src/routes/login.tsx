import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/auth/pages/LoginPage";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string; auth_error?: string } => {
    const out: { redirect?: string; auth_error?: string } = {};
    if (typeof s.redirect === "string") out.redirect = s.redirect;
    if (typeof s.auth_error === "string") out.auth_error = s.auth_error;
    return out;
  },
  head: () => ({ meta: [{ title: "Sign in — FlowyBookings" }] }),
  component: LoginPage,
});
