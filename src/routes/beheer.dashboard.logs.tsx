import { createFileRoute } from "@tanstack/react-router";
import { Store, CreditCard, CalendarRange, UserPlus, Settings, Ban, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";
import { relativeFromNow } from "@/lib/format";

export const Route = createFileRoute("/beheer/dashboard/logs")({
  head: () => ({ meta: [{ title: "Activity log — Platform" }] }),
  component: LogsPage,
});

type ActivityEntry = {
  id: string;
  type: "shop" | "booking" | "payment" | "user";
  action: string;
  target: string;
  time: string;
};

const activityLogQuery = () =>
  queryOptions({
    queryKey: ["admin", "activity-log"],
    queryFn: async (): Promise<ActivityEntry[]> => {
      // Build a combined activity feed from recent records across tables
      const [shopsRes, bookingsRes, paymentsRes, rolesRes] = await Promise.all([
        supabase.from("shops").select("id, name, status, created_at, updated_at").order("updated_at", { ascending: false }).limit(20),
        supabase.from("bookings").select("id, status, created_at, updated_at, shop_id").order("updated_at", { ascending: false }).limit(20),
        supabase.from("payments").select("id, status, amount_cents, currency, created_at, shop_id").order("created_at", { ascending: false }).limit(20),
        supabase.from("user_roles").select("id, role, user_id, created_at").order("created_at", { ascending: false }).limit(20),
      ]);

      // Get shop names for enrichment
      const shopIds = [
        ...new Set([
          ...(bookingsRes.data ?? []).map((b) => b.shop_id),
          ...(paymentsRes.data ?? []).map((p) => p.shop_id),
        ]),
      ];
      const shopsMap = new Map((shopsRes.data ?? []).map((s) => [s.id, s.name]));
      if (shopIds.length > 0) {
        const extra = await supabase.from("shops").select("id, name").in("id", shopIds);
        (extra.data ?? []).forEach((s) => shopsMap.set(s.id, s.name));
      }

      const entries: ActivityEntry[] = [];

      // Shop events
      (shopsRes.data ?? []).forEach((s) => {
        if (s.status === "suspended") {
          entries.push({ id: `shop-suspended-${s.id}`, type: "shop", action: "Shop suspended", target: s.name, time: s.updated_at });
        } else if (s.status === "active") {
          entries.push({ id: `shop-active-${s.id}`, type: "shop", action: "Shop activated", target: s.name, time: s.updated_at });
        }
        entries.push({ id: `shop-created-${s.id}`, type: "shop", action: "Shop created", target: s.name, time: s.created_at });
      });

      // Booking events
      (bookingsRes.data ?? []).forEach((b) => {
        const shop = shopsMap.get(b.shop_id) ?? "Unknown";
        entries.push({
          id: `booking-${b.id}`,
          type: "booking",
          action: `Booking ${b.status}`,
          target: `${shop} · #${b.id.slice(0, 8)}`,
          time: b.updated_at,
        });
      });

      // Payment events
      (paymentsRes.data ?? []).forEach((p) => {
        const shop = shopsMap.get(p.shop_id) ?? "Unknown";
        entries.push({
          id: `payment-${p.id}`,
          type: "payment",
          action: `Payment ${p.status}`,
          target: `${shop} · €${(p.amount_cents / 100).toFixed(2)}`,
          time: p.created_at,
        });
      });

      // Role events
      (rolesRes.data ?? []).forEach((r) => {
        entries.push({
          id: `role-${r.id}`,
          type: "user",
          action: `Role assigned: ${r.role.replace("_", " ")}`,
          target: `User ${r.user_id.slice(0, 8)}`,
          time: r.created_at,
        });
      });

      // Sort by time descending
      entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      return entries.slice(0, 50);
    },
    staleTime: 15_000,
  });

const iconMap: Record<string, typeof Store> = {
  shop: Store,
  payment: CreditCard,
  booking: CalendarRange,
  user: UserPlus,
};

const colorMap: Record<string, string> = {
  shop: "bg-primary-soft text-primary",
  payment: "bg-mint text-mint-foreground",
  booking: "bg-peach text-peach-foreground",
  user: "bg-pink text-pink-foreground",
};

function LogsPage() {
  const { data: logs, isLoading } = useQuery(activityLogQuery());

  return (
    <AdminLayout>
      <PageHeader title="Activity log" description="Recent platform activity across shops, bookings, payments and users." />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-2 shadow-soft">
          <ol className="relative">
            {(logs ?? []).length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">No activity yet.</li>
            )}
            {(logs ?? []).map((l) => {
              const Icon = iconMap[l.type] ?? Store;
              return (
                <li key={l.id} className="flex gap-4 px-4 py-4">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorMap[l.type] ?? colorMap.shop}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 border-b border-dashed border-border pb-4 last:border-b-0">
                    <p className="text-sm">
                      <span className="font-medium">{l.action}</span>{" "}
                      <span className="text-muted-foreground">·</span>{" "}
                      <span className="text-muted-foreground">{l.target}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{relativeFromNow(l.time)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </AdminLayout>
  );
}
