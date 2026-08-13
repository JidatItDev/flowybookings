import { createFileRoute } from "@tanstack/react-router";
import { SmsPage } from "@/admin/sms/SmsPage";

export const Route = createFileRoute("/beheer/dashboard/sms")({
  head: () => ({ meta: [{ title: "SMS — Platform" }] }),
  component: SmsPage,
});
