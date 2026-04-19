import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarClock,
  CalendarIcon,
  CircleDollarSign,
  Gift,
  Plus,
  Receipt,
  Save,
  StickyNote,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { RevenueSparkline } from "@/components/RevenueSparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { adminBillingQuery, adminBillingLogQuery } from "@/lib/admin-queries-extra";
import { adminPaymentsQuery } from "@/lib/admin-queries";
import { changeShopPlan, planLabel, ALL_DB_PLANS, type DbPlan } from "@/lib/plans";
import { formatCents, relativeFromNow } from "@/lib/format";
import {
  monthlyRevenueSeries,
  momRevenue,
  planDistribution,
  trialToPaidConversion,
  paymentHealth,
} from "@/lib/billing-analytics";
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
  const { data: payments } = useQuery(adminPaymentsQuery());
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

  const series = useMemo(() => monthlyRevenueSeries(payments ?? []), [payments]);
  const mom = useMemo(() => momRevenue(payments ?? []), [payments]);
  const dist = useMemo(() => planDistribution(rows ?? []), [rows]);
  const conversion = useMemo(() => trialToPaidConversion(rows ?? []), [rows]);
  const health = useMemo(() => paymentHealth(payments ?? []), [payments]);

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
        action: days >= 60 ? "free_access_granted" : "trial_extended",
        shop_id: shopId,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        metadata: { days, new_expires_at: newExpiry },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("adminBilling.expiryUpdated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setExpiry = useMutation({
    mutationFn: async ({ shopId, date, prev }: { shopId: string; date: Date; prev: string | null }) => {
      const newExpiry = date.toISOString();
      const { error } = await supabase
        .from("shops")
        .update({ plan_expires_at: newExpiry })
        .eq("id", shopId);
      if (error) throw error;
      await supabase.from("activity_log").insert({
        entity: "platform_billing",
        action: "expiry_set_manually",
        shop_id: shopId,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        metadata: { previous_expires_at: prev, new_expires_at: newExpiry },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("adminBilling.expiryUpdated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNote = useMutation({
    mutationFn: async ({ shopId, note }: { shopId: string; note: string }) => {
      const { error } = await supabase
        .from("shops")
        .update({ admin_notes: note || null } as never)
        .eq("id", shopId);
      if (error) throw error;
      await supabase.from("activity_log").insert({
        entity: "platform_billing",
        action: "admin_note_updated",
        shop_id: shopId,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        metadata: { length: note.length },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("adminBilling.noteSaved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalShops = (rows ?? []).length || 1;

  return (
    <AdminLayout>
      <PageHeader title={t("adminBilling.title")} description={t("adminBilling.description")} />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t("adminBilling.mrr")}
          value={formatCents(mom.current)}
          delta={`${mom.deltaPct >= 0 ? "+" : ""}${mom.deltaPct}% vs ${formatCents(mom.previous)}`}
          trend={mom.deltaPct >= 0 ? "up" : "down"}
          icon={TrendingUp}
          accent="primary"
        />
        <StatCard
          label={t("adminBilling.payingShops")}
          value={`${summary.paying}/${rows?.length ?? 0}`}
          delta={`${conversion.pct}% ${t("adminBilling.conversion")}`}
          trend="up"
          icon={Receipt}
          accent="mint"
        />
        <StatCard
          label={t("adminBilling.subscriptionRevenue")}
          value={formatCents(summary.totalRevenue)}
          trend="up"
          icon={CircleDollarSign}
          accent="peach"
        />
        <StatCard
          label={t("adminBilling.paymentHealth")}
          value={String(health.failed + health.pending)}
          delta={`${health.failed} ${t("adminBilling.failed")} · ${health.pending} ${t("adminBilling.pending")}`}
          trend={health.failed > 0 ? "down" : "neutral"}
          icon={CalendarClock}
          accent="pink"
        />
      </div>

      {/* Revenue chart + plan distribution */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">{t("adminBilling.revenueTrend")}</h2>
              <p className="text-xs text-muted-foreground">{t("adminBilling.revenueTrendDesc")}</p>
            </div>
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
              {t("adminBilling.last12mo")}
            </span>
          </div>
          <RevenueSparkline data={series} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <h2 className="text-base font-semibold">{t("adminBilling.planDistribution")}</h2>
          <p className="text-xs text-muted-foreground">{t("adminBilling.planDistributionDesc")}</p>
          <ul className="mt-4 space-y-3">
            {(["trial", "starter", "pro", "premium"] as DbPlan[]).map((p) => {
              const n = dist[p] ?? 0;
              const pct = Math.round((n / totalShops) * 100);
              return (
                <li key={p}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{planLabel(p)}</span>
                    <span className="text-muted-foreground">{n} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full",
                        p === "premium" && "bg-gradient-brand",
                        p === "pro" && "bg-primary",
                        p === "starter" && "bg-mint",
                        p === "trial" && "bg-peach",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
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

                  {/* Expiry date picker */}
                  <ExpiryPicker
                    value={expiry}
                    disabled={setExpiry.isPending}
                    onSelect={(d) => setExpiry.mutate({ shopId: r.shop_id, date: d, prev: r.plan_expires_at })}
                  />

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => extendTrial.mutate({ shopId: r.shop_id, days: 14 })}
                    disabled={extendTrial.isPending}
                  >
                    <Plus className="h-3.5 w-3.5" /> {t("adminBilling.extend14")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => extendTrial.mutate({ shopId: r.shop_id, days: 90 })}
                    disabled={extendTrial.isPending}
                  >
                    <Gift className="h-3.5 w-3.5" /> {t("adminBilling.grant90")}
                  </Button>

                  {/* Admin notes */}
                  <AdminNotesDialog
                    shopId={r.shop_id}
                    shopName={r.shop_name}
                    onSave={(note) => saveNote.mutate({ shopId: r.shop_id, note })}
                    saving={saveNote.isPending}
                  />
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

function ExpiryPicker({
  value,
  disabled,
  onSelect,
}: {
  value: Date | null;
  disabled?: boolean;
  onSelect: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {value ? format(value, "dd MMM yyyy") : "—"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => {
            if (d) {
              onSelect(d);
              setOpen(false);
            }
          }}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function AdminNotesDialog({
  shopId,
  shopName,
  onSave,
  saving,
}: {
  shopId: string;
  shopName: string;
  onSave: (note: string) => void;
  saving?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string>("");

  // Lazy-load existing note when opened so we don't fan out reads.
  const handleOpen = async (next: boolean) => {
    setOpen(next);
    if (next) {
      const { data } = await supabase
        .from("shops")
        .select("admin_notes" as never)
        .eq("id", shopId)
        .maybeSingle();
      setNote(((data as { admin_notes?: string | null } | null)?.admin_notes ?? "") || "");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <StickyNote className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("adminBilling.notesFor")} {shopName}</DialogTitle>
          <DialogDescription>{t("adminBilling.notesDesc")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("adminBilling.notesPlaceholder")}
          rows={6}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("calendar.cancel")}
          </Button>
          <Button
            onClick={() => {
              onSave(note.trim());
              setOpen(false);
            }}
            disabled={saving}
          >
            <Save className="h-3.5 w-3.5" />
            {t("calendar.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
