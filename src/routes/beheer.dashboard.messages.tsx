import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/admin/shell/AdminLayout";
import { EmailTemplatesPreview } from "@/admin/messages/EmailTemplatesPreview";
import { adminShopsQuery } from "@/admin/shared/admin-queries";
import { MessagesPage } from "@/admin/messages/MessagesPage";

export const Route = createFileRoute("/beheer/dashboard/messages")({
  head: () => ({ meta: [{ title: "Messaging — FlowyBookings admin" }] }),
  component: MessagesPage,
});
