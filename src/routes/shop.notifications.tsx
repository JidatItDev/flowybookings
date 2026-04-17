import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageSquare, Smartphone } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Bookly" }] }),
  component: NotificationsPage,
});

const channels = [
  { id: "email", name: "Email", icon: Mail, desc: "Always free.", color: "bg-primary-soft text-primary" },
  { id: "sms", name: "SMS", icon: Smartphone, desc: "€0.04 / message.", color: "bg-peach text-peach-foreground" },
  { id: "whatsapp", name: "WhatsApp", icon: MessageSquare, desc: "Pro plan and above.", color: "bg-mint text-mint-foreground" },
];

const events = [
  { id: "confirm", title: "Booking confirmation", desc: "Sent right after a booking is made." },
  { id: "reminder24", title: "24-hour reminder", desc: "Sent 24h before the appointment." },
  { id: "reminder2", title: "2-hour reminder", desc: "Final reminder, 2h before." },
  { id: "noshow", title: "No-show follow-up", desc: "Recover lost bookings politely." },
];

function NotificationsPage() {
  const [channelOn, setChannelOn] = useState({ email: true, sms: true, whatsapp: false });
  const [eventOn, setEventOn] = useState({ confirm: true, reminder24: true, reminder2: true, noshow: false });

  return (
    <ShopLayout>
      <PageHeader title="Notifications" description="Reminders and confirmations across channels." />

      <div className="grid gap-4 sm:grid-cols-3">
        {channels.map((c) => {
          const Icon = c.icon;
          const on = channelOn[c.id as keyof typeof channelOn];
          return (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", c.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <Toggle
                  on={on}
                  onChange={() => setChannelOn({ ...channelOn, [c.id]: !on })}
                />
              </div>
              <h3 className="mt-3 font-semibold">{c.name}</h3>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Reminder events</h2>
          <p className="text-xs text-muted-foreground">Pick which messages go out automatically.</p>
        </div>
        <div className="divide-y divide-border">
          {events.map((e) => {
            const on = eventOn[e.id as keyof typeof eventOn];
            return (
              <div key={e.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.desc}</p>
                </div>
                <Toggle on={on} onChange={() => setEventOn({ ...eventOn, [e.id]: !on })} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-end border-t border-border px-6 py-4">
          <Button variant="hero">Save changes</Button>
        </div>
      </div>
    </ShopLayout>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
