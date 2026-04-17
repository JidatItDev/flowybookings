import { createFileRoute } from "@tanstack/react-router";
import { Plus, CalendarRange } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { staff } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/staff")({
  head: () => ({ meta: [{ title: "Staff — Bookly" }] }),
  component: StaffPage,
});

function StaffPage() {
  return (
    <ShopLayout>
      <PageHeader
        title="Staff"
        description="Manage team members, services and working hours."
        actions={
          <Button variant="hero">
            <Plus className="h-4 w-4" /> Add staff
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {staff.map((m) => (
          <div key={m.id} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-base font-semibold text-primary-foreground">
                {m.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{m.name}</h3>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                      m.active ? "bg-mint text-mint-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {m.active ? "Active" : "Off"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{m.role}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarRange className="h-3.5 w-3.5" /> {m.hours}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Services
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.services.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" size="sm">Schedule</Button>
              <Button variant="ghost" size="sm">Edit</Button>
            </div>
          </div>
        ))}
      </div>
    </ShopLayout>
  );
}
