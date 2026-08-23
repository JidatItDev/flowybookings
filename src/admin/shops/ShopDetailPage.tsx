import { Link, useNavigate, getRouteApi } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, LogIn, Mail, Phone, MapPin, Clock, Activity } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import { toast } from "sonner";
import { AdminLayout } from "@/admin/shell/AdminLayout";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShopOverridesPanel } from "@/admin/shops/ShopOverridesPanel";
import { SubscriptionPanel } from "@/admin/shops/SubscriptionPanel";
import { RevenueSparkline } from "@/admin/shared/RevenueSparkline";
import { adminShopDetailQuery } from "@/admin/shared/admin-queries";
import { formatCents, formatDate, relativeFromNow } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useT } from "@/shared/lib/i18n";
import { useAuth } from "@/auth/lib/auth-context";
import { startImpersonate } from "@/admin/impersonation/impersonation";
import { planLabel } from "@/shared/lib/plans";

const Route = getRouteApi("/beheer/dashboard/shops/$shopId");

type ShopStatus = Database["public"]["Enums"]["shop_status"];

const planColor: Record<string, string> = {
  trial: "bg-muted text-muted-foreground",
  starter: "bg-info/15 text-info-foreground",
  pro: "bg-primary-soft text-primary",
  premium: "bg-gradient-brand text-primary-foreground",
};

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"];

const ACTION_LABELS: Record<string, string> = {
  shop_plan_change: "Plan gewijzigd",
  shop_status_change: "Status gewijzigd",
  mollie_connected: "Mollie gekoppeld",
  mollie_disconnected: "Mollie ontkoppeld",
  feature_override_set: "Feature override",
  feature_override_removed: "Override verwijderd",
  admin_impersonate_start: "Admin login als shop",
  admin_impersonate_stop: "Admin uitgelogd",
  plan_changed_by_admin: "Plan gewijzigd door admin",
  plan_upgraded_by_owner: "Plan geüpgraded door eigenaar",
};

export function ShopDetailPage() {
  const { shopId } = Route.useParams();
  const { t } = useT();
  const { user, setActiveShopId } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(adminShopDetailQuery(shopId));

  const updateStatus = useMutation({
    mutationFn: async (status: ShopStatus) => {
      const { error: e } = await supabase.from("shops").update({ status }).eq("id", shopId);
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(t("adminShops.updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });



  if (isLoading) {
    return (
      <AdminLayout>
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <PageHeader title={t("adminShopDetail.notFound")} />
        <Link to="/beheer/dashboard/shops" className="text-sm text-primary hover:underline">
          {t("adminShopDetail.back")}
        </Link>
      </AdminLayout>
    );
  }

  const { shop, owner, stats, customerSources, revenueLast30Days, events } = data;
  const policyDateFmt = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
  const sourceLabel = (src: string): string => {
    const map: Record<string, string> = {
      fresha: "Fresha", salonized: "Salonized", treatwell: "Treatwell",
      simplybook: "SimplyBook", planity: "Planity", csv: "CSV",
      manual: t("customers.sourceManual"), booking_page: t("customers.sourceBookingPage"),
    };
    return map[src] ?? src;
  };
  const eventLabel = (a: string) => ACTION_LABELS[a] ?? a.replace(/_/g, " ");

  const handleLoginAs = () => {
    startImpersonate(
      { shopId: shop.id, shopName: shop.name },
      { userId: user?.id ?? null, email: user?.email ?? null },
    );
    setActiveShopId(shop.id);
    navigate({ to: "/shop" });
  };

  return (
    <AdminLayout>
      <Link to="/beheer/dashboard/shops" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        {t("adminShopDetail.back")}
      </Link>

      {/* Header met identiteit + quick-actions */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-warm text-lg font-semibold text-pink-foreground">
            {shop.name[0]}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{shop.name}</h1>
            <p className="text-sm text-muted-foreground">/{shop.slug} · {shop.timezone}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={shop.status} />
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", planColor[shop.plan] ?? planColor.trial)}>
                {planLabel(shop.plan)}
              </span>
              {shop.is_demo && <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning-foreground">Demo</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleLoginAs}>
            <LogIn className="mr-1.5 h-4 w-4" /> {t("adminShopDetail.loginAs")}
          </Button>
          {shop.status === "active" ? (
            <Button variant="outline" size="sm" onClick={() => updateStatus.mutate("suspended")}>
              <Ban className="mr-1.5 h-4 w-4 text-destructive" /> {t("adminShopDetail.suspend")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => updateStatus.mutate("active")}>
              <CheckCircle2 className="mr-1.5 h-4 w-4 text-success-foreground" /> {t("adminShopDetail.activate")}
            </Button>
          )}
        </div>
      </div>

      {/* Omzet sparkline laatste 30 dagen */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Omzet (laatste 30 dagen)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Boekingsomzet per dag, exclusief geannuleerd & no-show</p>
          </div>
          <p className="text-right text-lg font-semibold tabular-nums">
            {formatCents(revenueLast30Days.reduce((s, d) => s + d.revenue, 0))}
          </p>
        </div>
        <RevenueSparkline data={revenueLast30Days} height={120} />
      </div>

      {/* Statistieken grid */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("adminShopDetail.statBookings")} value={stats.bookings.toString()} sub={`${stats.bookingsThisMonth} deze maand`} />
        <StatTile label={t("adminShopDetail.statRevenue")} value={formatCents(stats.revenueCents)} sub={`${stats.payments} betalingen`} />
        <StatTile label={t("adminShopDetail.statFees")} value={formatCents(stats.feesCents)} />
        <StatTile label={t("adminShopDetail.statCustomers")} value={stats.customers.toString()} sub={`${stats.importedCustomers} geïmporteerd`} />
        <StatTile label={t("adminShopDetail.statServices")} value={stats.services.toString()} />
        <StatTile label={t("adminShopDetail.statStaff")} value={stats.staff.toString()} />
        <StatTile
          label={t("adminShopDetail.statFailedPayments")}
          value={stats.failedPayments.toString()}
          tone={stats.failedPayments > 0 ? "warn" : "default"}
        />
        <StatTile label={t("adminShops.created")} value={formatDate(shop.created_at)} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {/* Eigenaar + contact */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("adminShopDetail.owner")}</h2>
          <p className="font-medium">{owner?.full_name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{owner?.email ?? "—"}</p>
          {owner?.phone && <p className="mt-1 text-sm text-muted-foreground">{owner.phone}</p>}
          <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminShopDetail.contact")}</h3>
            {shop.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {shop.email}</p>}
            {shop.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {shop.phone}</p>}
            {shop.address && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {shop.address}</p>}
          </div>
        </div>

        {/* Abonnement (compact summary; volledig beheer in panel hieronder) */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("adminShopDetail.subscription")}</h2>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">{t("adminShopDetail.changePlan")}:</span> <span className="font-medium">{planLabel(shop.plan)}</span></p>
            {shop.subscription_status && (
              <p><span className="text-muted-foreground">Status:</span> <span className="font-medium capitalize">{shop.subscription_status}</span></p>
            )}
            {shop.plan_billing_cycle && (
              <p className="text-muted-foreground"><span className="font-medium text-foreground">{t("adminShopDetail.billingCycle")}:</span> {shop.plan_billing_cycle}</p>
            )}
            {shop.plan_expires_at && (
              <p className="text-muted-foreground"><span className="font-medium text-foreground">{t("adminShopDetail.expiresAt")}:</span> {formatDate(shop.plan_expires_at)}</p>
            )}
            {shop.next_billing_at && (
              <p className="text-muted-foreground"><span className="font-medium text-foreground">{t("adminShopDetail.nextBilling")}:</span> {formatDate(shop.next_billing_at)}</p>
            )}
          </div>
        </div>

        {/* Beleid status */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("adminShopDetail.policyStatus")}</h2>
          {shop.policy_accepted_at ? (
            <div className="text-sm">
              <p className="text-success-foreground">✅ {t("adminShops.policyAcceptedOn")}</p>
              <p className="mt-1 text-muted-foreground">{policyDateFmt.format(new Date(shop.policy_accepted_at))}</p>
              {shop.policy_version && <p className="mt-1 text-xs text-muted-foreground">v{shop.policy_version}</p>}
            </div>
          ) : (
            <p className="text-sm font-medium text-destructive">⚠️ {t("adminShops.policyNotAcceptedWarning")}</p>
          )}
          {shop.admin_notes && (
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminShopDetail.adminNotes")}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{shop.admin_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bron-verdeling + recente activiteit */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("adminShopDetail.customerSources")}</h2>
          {customerSources.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("adminShopDetail.noCustomers")}</p>
          ) : (
            <div className="grid items-center gap-4 sm:grid-cols-2">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={customerSources}
                      dataKey="count"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {customerSources.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <ReTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(value, name) => [value as number, sourceLabel(String(name))]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5 text-sm">
                {customerSources.map((s, i) => (
                  <li key={s.source} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {sourceLabel(s.source)}
                    </span>
                    <span className="font-medium">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("adminShopDetail.recentActivity")}</h2>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {events.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">{t("adminShopDetail.noActivity")}</p>
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{eventLabel(e.action)}</p>
                    {e.actor_email && <p className="truncate text-xs text-muted-foreground">door {e.actor_email}</p>}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{relativeFromNow(e.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Subscription beheer (volledig) */}
      <div className="mb-6">
        <SubscriptionPanel
          shop={{
            id: shop.id,
            name: shop.name,
            plan: shop.plan,
            subscription_status: shop.subscription_status,
            plan_expires_at: shop.plan_expires_at,
            booking_fee_cents_override: shop.booking_fee_cents_override,
            next_billing_at: shop.next_billing_at,
            mollie_subscription_id: shop.mollie_subscription_id,
            mollie_customer_id: shop.mollie_customer_id,
            subscription_notes: shop.subscription_notes,
          }}
        />
      </div>

      {/* Feature overrides hergebruikt */}
      <ShopOverridesPanel shopId={shop.id} shopName={shop.name} plan={shop.plan} />
    </AdminLayout>
  );
}

function StatTile({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone === "warn" && "text-destructive")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
