import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { plans } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/beheer/dashboard/plans")({
  head: () => ({ meta: [{ title: "Plans — Admin" }] }),
  component: PlansPage,
});

function PlansPage() {
  return (
    <AdminLayout>
      <PageHeader title="Subscription plans" description="Pricing tiers, feature access and transaction fees." actions={<Button variant="hero">New plan</Button>} />
      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((p) => {
          const featured = p.name === "Pro";
          return (
            <div key={p.id} className={cn("relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft", featured ? "border-primary ring-soft" : "border-border")}>
              {featured && <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-xs font-semibold text-primary-foreground">Most popular</span>}
              <h3 className="text-base font-semibold">{p.name}</h3>
              <p className="mt-3 text-3xl font-semibold tracking-tight">€{p.price}<span className="text-sm font-normal text-muted-foreground">/{p.period}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">{p.fee} transaction fee · {p.shops} shops</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground" />{f}</li>
                ))}
              </ul>
              <div className="mt-6 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">Edit</Button>
                <Button variant="ghost" size="sm">Archive</Button>
              </div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
