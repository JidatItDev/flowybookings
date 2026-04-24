import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { adminShopsQuery } from "@/lib/admin-queries";
import { adminActivityLogQuery } from "@/lib/admin-queries-extra";
import { changeShopPlan, planLabel, ALL_DB_PLANS, type DbPlan } from "@/lib/plans";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/beheer/dashboard/plans")({
  head: () => ({ meta: [{ title: "Plans — Admin" }] }),
  component: PlansPage,
});

const PLAN_TIERS = [
  {
    plan: "starter" as DbPlan,
    label: "Starter",
    price: 19,
    features: ["bookings", "staff3", "email", "analytics"],
    fee: "1.5%",
  },
  {
    plan: "pro" as DbPlan,
    label: "Pro",
    price: 49,
    features: ["bookings", "staff10", "sms", "deposits", "advAnalytics", "branding"],
    fee: "1.0%",
    featured: true,
  },
  {
    plan: "premium" as DbPlan,
    label: "Premium",
    price: 99,
    features: ["bookings", "staffUnlimited", "whatsapp", "multiloc", "priority", "api"],
    fee: "0.5%",
  },
];

function PlansPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: shops, isLoading } = useQuery(adminShopsQuery());
  const { data: log } = useQuery(adminActivityLogQuery());

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    (shops ?? []).forEach((s) => m.set(s.plan, (m.get(s.plan) ?? 0) + 1));
    return m;
  }, [shops]);

  const planChanges = (log ?? []).filter(
    (l) => l.action === "plan_changed_by_admin" || l.action === "plan_upgraded_by_owner",
  );

  const update = useMutation({
    mutationFn: async ({ id, plan, prev }: { id: string; plan: DbPlan; prev: string }) => {
      await changeShopPlan({
        shopId: id,
        newPlan: plan,
        previousPlan: prev,
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        source: "admin",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("adminPlans.shopUpdated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <PageHeader title={t("adminPlans.title")} description={t("adminPlans.description")} />

      {/* Plan tiers (real definitions) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_TIERS.map((p) => (
          <div
            key={p.plan}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft",
              p.featured ? "border-primary ring-2 ring-primary/20" : "border-border",
            )}
          >
            {p.featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-xs font-semibold text-primary-foreground">
                {t("adminPlans.mostPopular")}
              </span>
            )}
            <h3 className="text-base font-semibold">{p.label}</h3>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              €{p.price}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {p.fee} {t("adminPlans.transactionFee")} · {counts.get(p.plan) ?? 0} {t("adminPlans.shopsOnPlan")}
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground" />
                  {t(`upgrade.feat.${f}`)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Per-shop plan management */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="text-base font-semibold">{t("adminPlans.manageShops")}</h2>
          <p className="text-xs text-muted-foreground">{t("adminPlans.manageShopsDesc")}</p>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4 sm:p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(shops ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">/{s.slug} · {s.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize">
                    {planLabel(s.plan)}
                  </span>
                  <select
                    value={s.plan}
                    disabled={update.isPending}
                    onChange={(e) =>
                      update.mutate({ id: s.id, plan: e.target.value as DbPlan, prev: s.plan })
                    }
                    className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
                  >
                    {ALL_DB_PLANS.map((p) => (
                      <option key={p} value={p}>
                        {planLabel(p)}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
            {(shops ?? []).length === 0 && (
              <li className="px-6 py-8 text-center text-sm text-muted-foreground">{t("adminPlans.noShops")}</li>
            )}
          </ul>
        )}
      </div>

      {/* Recent plan changes (audit) */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="text-base font-semibold">{t("adminPlans.recentChanges")}</h2>
        </div>
        {planChanges.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">{t("adminPlans.noChanges")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {planChanges.slice(0, 20).map((l) => {
              const meta = l.metadata as { previous_plan?: string; new_plan?: string };
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm sm:px-6">
                  <span className="font-medium">{l.shop_name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {meta.previous_plan} → <span className="font-medium text-foreground">{meta.new_plan}</span>
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {l.actor_email ?? "system"} · {new Date(l.created_at).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}
