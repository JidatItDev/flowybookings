import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { services } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/services")({
  head: () => ({ meta: [{ title: "Services — Bookly" }] }),
  component: ServicesPage,
});

const categoryColors: Record<string, string> = {
  Hair: "bg-primary-soft text-primary",
  Nails: "bg-pink text-pink-foreground",
  Beauty: "bg-peach text-peach-foreground",
  Tattoo: "bg-info/15 text-info-foreground",
  Pet: "bg-mint text-mint-foreground",
};

function ServicesPage() {
  return (
    <ShopLayout>
      <PageHeader
        title="Services"
        description="Manage your menu, pricing and deposits."
        actions={
          <Button variant="hero">
            <Plus className="h-4 w-4" /> Add service
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {services.map((s) => (
          <div key={s.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    categoryColors[s.category] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {s.category}
                </span>
                <h3 className="mt-2 text-base font-semibold">{s.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.duration} min</p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  s.active ? "bg-mint text-mint-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {s.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-2xl font-semibold tracking-tight">€{s.price}</p>
                {s.deposit > 0 && (
                  <p className="text-xs text-muted-foreground">€{s.deposit} deposit</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ShopLayout>
  );
}
