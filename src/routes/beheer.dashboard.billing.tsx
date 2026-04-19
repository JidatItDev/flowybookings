import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CircleDollarSign, Receipt, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { adminBillingQuery, adminBillingLogQuery } from "@/lib/admin-queries-extra";
import { changeShopPlan, planLabel, ALL_DB_PLANS, type DbPlan } from "@/lib/plans";
import { formatCents, relativeFromNow } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/beheer/dashboard/billing")({
  head: () => ({ meta: [{ title: "Billing — Platform" }] }),
  component: AdminBillingPage,
});

function AdminBillingPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: rows, isLoading } = useQuery(adminBillingQuery());
  const { data: log } = useQuery(adminBillingLogQuery());
  const [filter, setFilter] = useState<"all" | "active" | "expiring" | "expired">("all");

  const summary = useMemo(() => {
    const now = Date.now();
    const expiring = (rows ?? []).filter((r) => {
      if (!r.plan_expires_at) return false;
      const ms = new Date(r.plan_expires_at).getTime() - now;
      return ms > 0 && ms < 7 * 24 * 3600 * 1000;
    });
    const expired = (rows ?? []).filter(
      (r) => r.plan_expires_at && new Date(r.plan_expires_at).getTime() < now,
    );
    const totalRevenue = (rows ?? []).reduce((s, r) => s + r.total_paid_cents, 0);
    const paying = (rows ?? []).filter((r) => r.payment_count > 0).length;
    return { expiring: expiring.length, expired: expired.length, totalRevenue, paying };
  }, [rows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return (rows ?? []).filter((r) => {
      if (filter === "all") return true;
      if (filter === "active") return r.plan_expires_at && new Date(r.plan_expires_at).getTime() > now;
      if (filter === "expiring") {
        if (!r.plan_expires_at) return false;
        const ms = new Date(r.plan_expires_at).getTime() - now;
        return ms > 0 && ms < 7 * 24 * 3600 * 1000;
      }
      if (filter === "expired") return r.plan_expires_at && new Date(r.plan_expires_at).getTime() < now;
      return true;
    });
  }, [rows, filter]);

  const setPlan = useMutation({
    mutationFn: async ({ shopId, plan, prev }: { shopId: string; plan: DbPlan; prev: string }) => {
      await changeShopPlan({
        shopId,
        newPlan: plan,
        previousPlan: prev,
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        source: "admin",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("adminBilling.planUpdated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extendTrial = useMutation({
    mutationFn: async ({ shopId, days }: { shopId: string; days: number }) => {
      const { data: shop } = await supabase
        .from("shops")
        .select("plan_expires_at")
        .eq("id", shopId)
        .maybeSingle();
      const base = shop?.plan_expires_at ? new Date(shop.plan_expires_at) : new Date();
      if (base.getTime() < Date.now()) base.setTime(Date.now());
      base.setDate(base.getDate() + days);
      const newExpiry = base.toISOString();
      const { error } = await supabase
        .from("shops")
        .update({ plan_expires_at: newExpiry })
        .eq("id", shopId);
      if (error) throw error;
      await supabase.from("activity_log").insert({
        entity: "platform_billing",
        action: "trial_extended",
        shop_id: shopId,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        metadata: { days, new_expires_at: newExpiry },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("adminBilling.trialExtended"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <PageHeader title={t("adminBilling.title")} description={t("adminBilling.description")} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t("adminBilling.payingShops")}
          value={String(summary.paying)}
          trend="up"
          icon={Receipt}
          accent="primary"
        />
        <StatCard
          label={t("adminBilling.subscriptionRevenue")}
          value={formatCents(summary.totalRevenue)}
          trend="up"
          icon={CircleDollarSign}
          accent="mint"
        />
        <StatCard
          label={t("adminBilling.expiringSoon")}
          value={String(summary.expiring)}
          delta={t("adminBilling.next7days")}
          trend="neutral"
          icon={CalendarClock}
          accent="peach"
        />
        <StatCard
          label={t("adminBilling.expired")}
          value={String(summary.expired)}
          trend="down"
          icon={CalendarClock}
          accent="pink"
        />
      </div>

      {/* Filter pills */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["all", "active", "expiring", "expired"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`adminBilling.filter.${f}`)}
          </button>
        ))}
      </div>

      {/* Shops table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="text-base font-semibold">{t("adminBilling.shopsTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("adminBilling.shopsDesc")}</p>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4 sm:p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
            {t("adminBilling.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const expiry = r.plan_expires_at ? new Date(r.plan_expires_at) : null;
              const expired = expiry && expiry.getTime() < Date.now();
              return (
                <li key={r.shop_id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.shop_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.owner_email ?? "—"} · {planLabel(r.plan)}
                      {r.plan_billing_cycle ? ` · ${r.plan_billing_cycle}` : ""}
                    </p>
                  </div>
                  <div className="hidden flex-col text-right text-xs sm:flex">
                    <span className="text-muted-foreground">{t("adminBilling.expiresAt")}</span>
                    <span className={cn("font-medium", expired && "text-destructive")}>
                      {expiry ? expiry.toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <div className="hidden flex-col text-right text-xs sm:flex">
                    <span className="text-muted-foreground">{t("adminBilling.lastPayment")}</span>
                    <span className="font-medium capitalize">
                      {r.last_payment_status ?? "—"}
                      {r.last_payment_at ? ` · ${relativeFromNow(r.last_payment_at)}` : ""}
                    </span>
                  </div>
                  <div className="hidden flex-col text-right text-xs md:flex">
                    <span className="text-muted-foreground">{t("adminBilling.totalPaid")}</span>
                    <span className="font-semibold">{formatCents(r.total_paid_cents)}</span>
                  </div>
                  <select
                    value={r.plan}
                    disabled={setPlan.isPending}
                    onChange={(e) =>
                      setPlan.mutate({ shopId: r.shop_id, plan: e.target.value as DbPlan, prev: r.plan })
                    }
                    className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
                  >
                    {ALL_DB_PLANS.map((p) => (
                      <option key={p} value={p}>
                        {planLabel(p)}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => extendTrial.mutate({ shopId: r.shop_id, days: 14 })}
                    disabled={extendTrial.isPending}
                  >
                    <Plus className="h-3.5 w-3.5" /> {t("adminBilling.extend14")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Recent billing log */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="text-base font-semibold">{t("adminBilling.logTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("adminBilling.logDesc")}</p>
        </div>
        {(log ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
            {t("adminBilling.noLog")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(log ?? []).slice(0, 20).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm sm:px-6">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize">
                  {l.action.replaceAll("_", " ")}
                </span>
                <span className="font-medium">{l.shop_name ?? "—"}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {l.actor_email ?? "system"} · {new Date(l.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}
