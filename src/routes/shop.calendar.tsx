import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Filter } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { bookings, type BookingStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Bookly" }] }),
  component: CalendarPage,
});

const statuses: (BookingStatus | "all")[] = ["all", "pending", "confirmed", "completed", "cancelled", "no-show"];
const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8 → 18
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarPage() {
  const [view, setView] = useState<"day" | "week">("week");
  const [filter, setFilter] = useState<(typeof statuses)[number]>("all");
  const filtered = bookings.filter((b) => filter === "all" || b.status === filter);

  return (
    <ShopLayout>
      <PageHeader
        title="Calendar"
        description="View and manage all upcoming appointments."
        actions={
          <>
            <div className="flex items-center rounded-xl border border-border bg-card p-1">
              {(["day", "week"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium capitalize",
                    view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="hero">
              <Plus className="h-4 w-4" /> New booking
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize",
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="px-2 text-sm font-medium">This week</span>
          <Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/40">
          <div />
          {days.map((d) => (
            <div key={d} className="border-l border-border px-2 py-3 text-center text-xs font-semibold">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {hours.map((h) => (
            <Hour key={h} hour={h} bookings={filtered} />
          ))}
        </div>
      </div>
    </ShopLayout>
  );
}

function Hour({ hour, bookings }: { hour: number; bookings: typeof import("@/lib/mock-data").bookings }) {
  return (
    <>
      <div className="border-t border-border px-2 py-3 text-right text-[11px] text-muted-foreground">
        {hour}:00
      </div>
      {Array.from({ length: 7 }).map((_, dayIdx) => {
        const slotBookings = bookings.filter((b) => {
          const d = new Date(b.date);
          // Map: today in mock data uses today as day 0, +1, +2
          const dayOffset = Math.floor((+d - +new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
          // Place into the visible week roughly by dayOffset (clamped)
          const colDay = ((new Date().getDay() + 6) % 7) + dayOffset; // monday=0
          return d.getHours() === hour && colDay === dayIdx;
        });
        return (
          <div
            key={dayIdx}
            className="relative min-h-16 border-l border-t border-border p-1"
          >
            {slotBookings.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "rounded-lg px-2 py-1 text-[11px] leading-tight shadow-xs",
                  b.status === "confirmed" && "bg-primary-soft text-primary",
                  b.status === "pending" && "bg-warning/20 text-warning-foreground",
                  b.status === "completed" && "bg-mint text-mint-foreground",
                  b.status === "cancelled" && "bg-muted text-muted-foreground line-through",
                  b.status === "no-show" && "bg-destructive/15 text-destructive",
                )}
              >
                <p className="truncate font-medium">{b.customer}</p>
                <p className="truncate opacity-80">{b.service}</p>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
