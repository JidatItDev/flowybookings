import { createFileRoute } from "@tanstack/react-router";
import { MessagesPage } from "@/admin/messages/MessagesPage";

export const Route = createFileRoute("/beheer/dashboard/messages")({
  head: () => ({ meta: [{ title: "Messaging — FlowyBookings admin" }] }),
  component: MessagesPage,
});
