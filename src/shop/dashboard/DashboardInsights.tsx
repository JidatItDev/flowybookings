import { useMemo } from "react";
import { Trophy, CalendarDays, AlertTriangle, Sparkles, Users, Repeat } from "lucide-react";
import { formatCents } from "@/shared/lib/format";
import { useT } from "@/shared/lib/i18n";
import type { BookingWithRelations } from "@/shop/shared/queries-barrel";

type Customer = { id: string; full_name: string; total_spent_cents: number; created_at: string };
type Service = { id: string; name: string };

interface Props {
  bookings: BookingWithRelations[];
  customers: Customer[];
  services: Service[];
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function DashboardInsights({ bookings, customers, services }: Props) {
  const { t } = useT();

  const insights = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const earned = (b: BookingWithRelations) => b.status !== "cancelled" && b.status !== "no_show";

    // Revenue
    const totalRevenue = bookings.filter(earned).reduce((s, b) => s + b.price_cents, 0);
    const monthRevenue = bookings
      .filter((b) => earned(b) && new Date(b.starts_at) >= monthStart)
      .reduce((s, b) => s + b.price_cents, 0);

    // Revenue per service
    const revPerService = new Map<string, number>();
    const countPerService = new Map<string, number>();
    bookings.forEach((b) => {
      if (!b.service_id) return;
      if (earned(b)) revPerService.set(b.service_id, (revPerService.get(b.service_id) ?? 0) + b.price_cents);
      countPerService.set(b.service_id, (countPerService.get(b.service_id) ?? 0) + 1);
    });
    const topServices = [...revPerService.entries()]
      .map(([id, cents]) => ({ id, name: services.find((s) => s.id === id)?.name ?? "—", cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 5);

    // Booking status breakdown
    const total = bookings.length;
    const completed = bookings.filter((b) => b.status === "completed").length;
    const cancelled = bookings.filter((b) => b.status === "cancelled").length;
    const noShow = bookings.filter((b) => b.status === "no_show").length;
    const confirmed = bookings.filter((b) => b.status === "confirmed").length;
    const pending = bookings.filter((b) => b.status === "pending").length;

    // Top customers
    const topCustomers = [...customers]
      .sort((a, b) => (b.total_spent_cents ?? 0) - (a.total_spent_cents ?? 0))
      .slice(0, 5);

    // Returning vs new (returning = >1 booking; new = exactly 1 booking)
    const bookingsByCustomer = new Map<string, number>();
    bookings.forEach((b) => {
      if (!b.customer_id) return;
      bookingsByCustomer.set(b.customer_id, (bookingsByCustomer.get(b.customer_id) ?? 0) + 1);
    });
    let returning = 0;
    let newCust = 0;
    bookingsByCustomer.forEach((c) => (c > 1 ? returning++ : newCust++));
    const knownTotal = returning + newCust || 1;
    const returningPct = Math.round((returning / knownTotal) * 100);

    // Smart: lost from no-shows this month
    const noShowLossMonth = bookings
      .filter((b) => b.status === "no_show" && new Date(b.starts_at) >= monthStart)
      .reduce((s, b) => s + b.price_cents, 0);

    // Most popular service (by booking count, excluding cancelled)
    const popular = [...countPerService.entries()].sort((a, b) => b[1] - a[1])[0];
    const popularService = popular ? services.find((s) => s.id === popular[0])?.name ?? "—" : null;
    const popularCount = popular?.[1] ?? 0;

    // Busiest weekday (last 90 days)
    const ninetyAgo = Date.now() - 90 * 86400000;
    const dayCounts = new Array(7).fill(0);
    bookings.forEach((b) => {
      const d = new Date(b.starts_at);
      if (d.getTime() < ninetyAgo) return;
      if (b.status === "cancelled") return;
      dayCounts[d.getUTCDay()]++;
    });
    const maxIdx = dayCounts.indexOf(Math.max(...dayCounts));
    const busiestDay = dayCounts[maxIdx] > 0 ? WEEKDAY_KEYS[maxIdx] : null;

    return {
      totalRevenue, monthRevenue, topServices,
      total, completed, cancelled, noShow, confirmed, pending,
      topCustomers, returning, newCust, returningPct,
      noShowLossMonth, popularService, popularCount, busiestDay,
    };
  }, [bookings, customers, services]);

  const completionPct = insights.total ? Math.round((insights.completed / insights.total) * 100) : 0;
  const cancelledPct = insights.total ? Math.round((insights.cancelled / insights.total) * 100) : 0;
  const noShowPct = insights.total ? Math.round((insights.noShow / insights.total) * 100) : 0;

  return (
    <div className="mt-6 space-y-6">
      {/* Smart insights row */}
      <div className="grid gap-4 md:grid-cols-3">
        <SmartCard
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="destructive"
          label={t("insights.lostNoShowsTitle")}
          value={formatCents(insights.noShowLossMonth)}
          hint={t("insights.lostNoShowsHint")}
        />
        <SmartCard
          icon={<Sparkles className="h-5 w-5" />}
          tone="primary"
          label={t("insights.popularServiceTitle")}
          value={insights.popularService ?? "—"}
          hint={insights.popularService ? t("insights.popularServiceHint", { n: insights.popularCount }) : t("insights.notEnoughData")}
        />
        <SmartCard
          icon={<CalendarDays className="h-5 w-5" />}
          tone="mint"
          label={t("insights.busiestDayTitle")}
          value={insights.busiestDay ? t(`weekday.${insights.busiestDay}`) : "—"}
          hint={insights.busiestDay ? t("insights.busiestDayHint") : t("insights.notEnoughData")}
        />
      </div>

      {/* Revenue + booking breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="text-base font-semibold">{t("insights.revenueTitle")}</h3>
          <div className="mt-4 space-y-3">
            <Row label={t("insights.totalRevenue")} value={formatCents(insights.totalRevenue)} strong />
            <Row label={t("insights.monthRevenue")} value={formatCents(insights.monthRevenue)} />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("insights.revenuePerService")}
            </p>
            {insights.topServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("insights.notEnoughData")}</p>
            ) : (
              <ul className="space-y-2">
                {insights.topServices.map((s) => {
                  const pct = insights.totalRevenue ? Math.round((s.cents / insights.totalRevenue) * 100) : 0;
                  return (
                    <li key={s.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate pr-2">{s.name}</span>
                        <span className="font-medium">{formatCents(s.cents)}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="text-base font-semibold">{t("insights.bookingsTitle")}</h3>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{insights.total}</p>
          <p className="text-xs text-muted-foreground">{t("insights.totalBookingsHint")}</p>
          <div className="mt-5 space-y-3">
            <StatusBar label={t("insights.completed")} value={insights.completed} pct={completionPct} className="bg-success" />
            <StatusBar label={t("insights.cancelled")} value={insights.cancelled} pct={cancelledPct} className="bg-muted-foreground/40" />
            <StatusBar label={t("insights.noShow")} value={insights.noShow} pct={noShowPct} className="bg-destructive" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            <Row label={t("insights.confirmed")} value={String(insights.confirmed)} />
            <Row label={t("insights.pending")} value={String(insights.pending)} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="text-base font-semibold">{t("insights.customersTitle")}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat icon={<Repeat className="h-4 w-4" />} label={t("insights.returning")} value={insights.returning} accent="primary" />
            <MiniStat icon={<Users className="h-4 w-4" />} label={t("insights.newCustomers")} value={insights.newCust} accent="mint" />
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${insights.returningPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("insights.returningPct", { pct: insights.returningPct })}
          </p>
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" /> {t("insights.topCustomers")}
            </div>
            {insights.topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("insights.notEnoughData")}</p>
            ) : (
              <ul className="space-y-2">
                {insights.topCustomers.map((c, i) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="truncate">{c.full_name}</span>
                    </span>
                    <span className="font-medium">{formatCents(c.total_spent_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={strong ? "text-lg font-semibold" : "text-sm font-medium"}>{value}</span>
    </div>
  );
}

function StatusBar({ label, value, pct, className }: { label: string; value: number; pct: number; className: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value} · {pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${className}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: "primary" | "mint" }) {
  const cls = accent === "primary" ? "bg-primary-soft text-primary" : "bg-mint text-mint-foreground";
  return (
    <div className="rounded-xl border border-border p-3">
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${cls}`}>{icon}</div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SmartCard({
  icon, label, value, hint, tone,
}: { icon: React.ReactNode; label: string; value: string; hint: string; tone: "destructive" | "primary" | "mint" }) {
  const toneCls =
    tone === "destructive"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "primary"
        ? "border-primary/30 bg-primary-soft/40"
        : "border-mint/40 bg-mint/30";
  const iconCls =
    tone === "destructive"
      ? "bg-destructive/15 text-destructive"
      : tone === "primary"
        ? "bg-primary text-primary-foreground"
        : "bg-mint text-mint-foreground";
  return (
    <div className={`rounded-2xl border p-5 shadow-soft ${toneCls}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${iconCls}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}
