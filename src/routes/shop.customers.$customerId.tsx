import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Phone,
  AlertTriangle,
  ShieldAlert,
  CalendarDays,
  Wallet,
  Save,
  Plus,
  X,
  Tag as TagIcon,
  Sparkle,
  CreditCard,
  Undo2,
  Heart,
} from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { NoShopState } from "@/components/EmptyState";
import { useImpersonationReadOnly, assertNotImpersonating } from "@/components/ImpersonationBanner";
import { useActiveShopId } from "@/lib/shop-context";
import { bookingsQuery, servicesQuery, staffQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, formatDateTime, initials, relativeFromNow } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop/customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer profile — FlowyBookings" }] }),
  component: CustomerProfilePage,
});

type CustomerPreferences = {
  favorite_staff_id?: string | null;
  favorite_service_id?: string | null;
  allergies?: string;
  communication?: "email" | "sms" | "any" | "none";
  language?: "nl" | "en" | "any";
  notes?: string;
};

type CustomerRow = {
  id: string;
  shop_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  total_spent_cents: number;
  last_visit_at: string | null;
  no_show_count: number;
  requires_deposit: boolean;
  tags: string[] | null;
  preferences: CustomerPreferences | null;
  created_at: string;
  import_source: string | null;
  imported_at: string | null;
};

const SUGGESTED_TAGS = ["VIP", "New", "Risky", "Loyal", "Walk-in"];

function CustomerProfilePage() {
  const shopId = useActiveShopId();
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useT();
  const readOnly = useImpersonationReadOnly();
  const roTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;

  const customerQuery = useQuery({
    queryKey: ["customer", customerId],
    enabled: !!shopId && !!customerId,
    queryFn: async (): Promise<CustomerRow | null> => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data as CustomerRow | null;
    },
  });

  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: services = [] } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });
  const { data: staffList = [] } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId });

  const customerBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.customer_id === customerId)
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()),
    [bookings, customerId],
  );

  const serviceMap = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services]);

  // All payments for this customer's bookings (for the unified timeline).
  const customerBookingIds = useMemo(() => customerBookings.map((b) => b.id), [customerBookings]);
  const paymentsQuery = useQuery({
    queryKey: ["customer-payments", customerId, customerBookingIds],
    enabled: !!shopId && customerBookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, booking_id, amount_cents, currency, status, provider, provider_payment_id, created_at, metadata")
        .in("booking_id", customerBookingIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const customerPayments = paymentsQuery.data ?? [];

  // Unified, sorted timeline (newest first) of bookings + payments.
  type TimelineItem =
    | { kind: "booking"; id: string; at: string; data: (typeof customerBookings)[number] }
    | { kind: "payment"; id: string; at: string; data: (typeof customerPayments)[number] };
  const timeline: TimelineItem[] = useMemo(() => {
    const b: TimelineItem[] = customerBookings.map((row) => ({
      kind: "booking",
      id: `b-${row.id}`,
      at: row.starts_at,
      data: row,
    }));
    const p: TimelineItem[] = customerPayments.map((row) => ({
      kind: "payment",
      id: `p-${row.id}`,
      at: row.created_at,
      data: row,
    }));
    return [...b, ...p].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [customerBookings, customerPayments]);

  const [timelineFilter, setTimelineFilter] = useState<"all" | "bookings" | "payments">("all");
  const filteredTimeline = useMemo(() => {
    if (timelineFilter === "all") return timeline;
    if (timelineFilter === "bookings") return timeline.filter((i) => i.kind === "booking");
    return timeline.filter((i) => i.kind === "payment");
  }, [timeline, timelineFilter]);

  const customer = customerQuery.data;

  // Local editable state
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [requiresDeposit, setRequiresDeposit] = useState(false);

  // Preferences (editor-card state)
  const [favStaff, setFavStaff] = useState<string>("none");
  const [favService, setFavService] = useState<string>("none");
  const [allergies, setAllergies] = useState("");
  const [communication, setCommunication] = useState<"email" | "sms" | "any" | "none">("any");

  useEffect(() => {
    if (customer) {
      setNotes(customer.notes ?? "");
      setTags(customer.tags ?? []);
      setRequiresDeposit(customer.requires_deposit);
      const p = customer.preferences ?? {};
      setFavStaff(p.favorite_staff_id ?? "none");
      setFavService(p.favorite_service_id ?? "none");
      setAllergies(p.allergies ?? "");
      setCommunication(p.communication ?? "any");
    }
  }, [customer?.id]);

  const update = useMutation({
    mutationFn: async (patch: {
      notes?: string | null;
      tags?: string[];
      requires_deposit?: boolean;
      preferences?: CustomerPreferences;
    }) => {
      assertNotImpersonating();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("customers").update(patch as any).eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("customers.updated"));
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.customers(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePreferences = () => {
    const next: CustomerPreferences = {
      ...(customer?.preferences ?? {}),
      favorite_staff_id: favStaff === "none" ? null : favStaff,
      favorite_service_id: favService === "none" ? null : favService,
      allergies: allergies.trim() || undefined,
      communication,
    };
    update.mutate(
      { preferences: next },
      { onSuccess: () => toast.success(t("customers.preferencesSaved")) },
    );
  };

  const addTag = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (tags.includes(v)) return;
    const next = [...tags, v];
    setTags(next);
    setTagInput("");
    update.mutate({ tags: next });
  };
  const removeTag = (v: string) => {
    const next = tags.filter((x) => x !== v);
    setTags(next);
    update.mutate({ tags: next });
  };

  if (!shopId) return <ShopLayout><NoShopState /></ShopLayout>;

  if (customerQuery.isLoading) {
    return (
      <ShopLayout>
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
      </ShopLayout>
    );
  }

  if (!customer) {
    return (
      <ShopLayout>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("customers.profileNotFound")}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/shop/customers" })}>
            <ArrowLeft className="h-4 w-4" /> {t("customers.backToList")}
          </Button>
        </div>
      </ShopLayout>
    );
  }

  const ns = customer.no_show_count ?? 0;
  const totalBookings = customerBookings.length;
  const completedBookings = customerBookings.filter((b) => b.status === "completed").length;
  const firstBooking = customerBookings[customerBookings.length - 1];
  const avgSpend = totalBookings > 0 ? Math.round(customer.total_spent_cents / totalBookings) : 0;
  const sourceLabels: Record<string, string> = {
    fresha: "Fresha", salonized: "Salonized", treatwell: "Treatwell",
    simplybook: "SimplyBook", planity: "Planity", csv: "CSV",
    manual: t("customers.sourceManual"), booking_page: t("customers.sourceBookingPage"),
  };
  const sourceText = customer.import_source
    ? t("customers.sourceImported", { platform: sourceLabels[customer.import_source] ?? customer.import_source })
    : t("customers.sourceManual");

  return (
    <ShopLayout>
      <div className="mb-4">
        <Link
          to="/shop/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("customers.backToList")}
        </Link>
      </div>

      <PageHeader title={customer.full_name} description={t("customers.profileSubtitle")} />

      {/* Identity card */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-warm text-lg font-semibold text-pink-foreground">
                {initials(customer.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">{customer.full_name}</h2>
                  {ns >= 2 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                      <ShieldAlert className="h-3 w-3" /> {t("customers.repeatNoShow")}
                    </span>
                  )}
                  {customer.requires_deposit && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                      {t("customers.depositRequired")}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                      <Mail className="h-3.5 w-3.5" /> {customer.email}
                    </a>
                  )}
                  {customer.phone && (
                    <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" /> {customer.phone}
                    </a>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkle className="h-3.5 w-3.5" /> {t("customers.customerSince", { date: relativeFromNow(customer.created_at) })}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {sourceText}
                  {customer.imported_at && ` · ${formatDateTime(customer.imported_at)}`}
                </p>
              </div>
            </div>

            {/* Tags */}
            <div className="mt-5 border-t border-border pt-5">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <TagIcon className="h-4 w-4 text-muted-foreground" /> {t("customers.tags")}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tags.length === 0 && (
                  <span className="text-xs text-muted-foreground">{t("customers.noTags")}</span>
                )}
                {tags.map((tg) => (
                  <span
                    key={tg}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {tg}
                    <button
                      type="button"
                      onClick={() => removeTag(tg)}
                      disabled={readOnly}
                      title={roTitle}
                      className="rounded-full p-0.5 hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Remove ${tg}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder={t("customers.addTagPlaceholder")}
                  disabled={readOnly}
                  title={roTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  className="h-9 max-w-xs"
                />
                <Button size="sm" variant="outline" onClick={() => addTag(tagInput)} disabled={!tagInput.trim() || readOnly} title={roTitle}>
                  <Plus className="h-4 w-4" /> {t("customers.addTag")}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTED_TAGS.filter((s) => !tags.includes(s)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addTag(s)}
                    disabled={readOnly}
                    title={roTitle}
                    className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Unified timeline: bookings + payments, newest first */}
          <div className="rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
              <div>
                <h3 className="text-sm font-semibold">{t("customers.timeline")}</h3>
                <p className="text-xs text-muted-foreground">
                  {timeline.length === 0
                    ? t("customers.timelineSubtitle")
                    : t("customers.timelineCount", { count: String(timeline.length) })}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 text-xs">
                {(["all", "bookings", "payments"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTimelineFilter(f)}
                    className={cn(
                      "rounded-full px-3 py-1 font-medium transition-colors",
                      timelineFilter === f
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f === "all"
                      ? t("customers.timelineFilterAll")
                      : f === "bookings"
                        ? t("customers.timelineFilterBookings")
                        : t("customers.timelineFilterPayments")}
                  </button>
                ))}
              </div>
            </div>
            {filteredTimeline.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {timeline.length === 0 ? t("customers.timelineEmpty") : t("customers.noBookings")}
              </div>
            ) : (
              <ol className="divide-y divide-border">
                {filteredTimeline.map((item) => {
                  if (item.kind === "booking") {
                    const b = item.data;
                    const svc = b.service_id ? serviceMap[b.service_id] : null;
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {svc?.name ?? t("customers.serviceRemoved")}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatDateTime(b.starts_at)}
                          </p>
                        </div>
                        <StatusBadge status={b.status} />
                        <span className="w-24 text-right text-sm font-medium tabular-nums">
                          {formatCents(b.price_cents)}
                        </span>
                      </li>
                    );
                  }
                  // Payment row
                  const p = item.data;
                  const isRefund = p.status === "refunded";
                  const linkedBooking = customerBookings.find((b) => b.id === p.booking_id);
                  const providerLabel =
                    p.provider && p.provider.length > 0
                      ? p.provider.charAt(0).toUpperCase() + p.provider.slice(1)
                      : null;
                  const title = providerLabel
                    ? t("customers.timelinePaymentTitle", { provider: providerLabel })
                    : t("customers.timelinePaymentNoProvider");
                  const subtitle = linkedBooking
                    ? t("customers.timelinePaymentForBooking", {
                        date: formatDateTime(linkedBooking.starts_at),
                      })
                    : t("customers.timelinePaymentNoBooking");
                  const statusKey = `customers.paymentStatus.${p.status}` as
                    | "customers.paymentStatus.unpaid"
                    | "customers.paymentStatus.deposit_paid"
                    | "customers.paymentStatus.paid"
                    | "customers.paymentStatus.refunded"
                    | "customers.paymentStatus.failed";
                  const statusToneCls =
                    p.status === "paid"
                      ? "bg-success/15 text-success-foreground"
                      : p.status === "deposit_paid"
                        ? "bg-primary/15 text-primary"
                        : p.status === "refunded"
                          ? "bg-amber-500/15 text-amber-700"
                          : p.status === "failed"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground";
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          isRefund ? "bg-amber-500/10 text-amber-700" : "bg-primary/10 text-primary",
                        )}
                      >
                        {isRefund ? (
                          <Undo2 className="h-4 w-4" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDateTime(p.created_at)} · {subtitle}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          statusToneCls,
                        )}
                      >
                        {t(statusKey)}
                      </span>
                      <span
                        className={cn(
                          "w-24 text-right text-sm font-semibold tabular-nums",
                          isRefund ? "text-amber-700" : "text-foreground",
                        )}
                      >
                        {isRefund ? "−" : ""}
                        {formatCents(p.amount_cents)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {/* Sidebar: stats + notes */}
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <StatTile
              icon={Wallet}
              label={t("customers.totalSpent")}
              value={formatCents(customer.total_spent_cents)}
            />
            <StatTile
              icon={CalendarDays}
              label={t("customers.bookingsLabel")}
              value={`${completedBookings}/${totalBookings}`}
              hint={t("customers.completedOfTotal")}
            />
            <StatTile
              icon={Wallet}
              label={t("customers.avgPerVisit")}
              value={formatCents(avgSpend)}
            />
            {firstBooking && (
              <StatTile
                icon={Sparkle}
                label={t("customers.firstVisit")}
                value={relativeFromNow(firstBooking.starts_at)}
              />
            )}
            <StatTile
              icon={AlertTriangle}
              label={t("customers.noShows")}
              value={String(ns)}
              tone={ns === 0 ? "ok" : ns === 1 ? "warn" : "bad"}
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <Label htmlFor="notes" className="text-sm font-semibold">
              {t("customers.notes")}
            </Label>
            <p className="mb-2 text-xs text-muted-foreground">{t("customers.notesHint")}</p>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder={t("customers.notesPlaceholder")}
              disabled={readOnly}
              title={roTitle}
            />
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={requiresDeposit}
                  disabled={readOnly}
                  title={roTitle}
                  onChange={(e) => {
                    setRequiresDeposit(e.target.checked);
                    update.mutate({ requires_deposit: e.target.checked });
                  }}
                />
                {t("customers.requireDeposit")}
              </label>
              <Button
                size="sm"
                variant="hero"
                onClick={() => update.mutate({ notes: notes.trim() || null })}
                disabled={update.isPending || readOnly}
                title={roTitle}
              >
                <Save className="h-4 w-4" /> {update.isPending ? t("customers.saving") : t("customers.saveNotes")}
              </Button>
            </div>
          </div>

          {/* Preferences editor */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-1 flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{t("customers.preferences")}</h3>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">{t("customers.preferencesHint")}</p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t("customers.favoriteStaff")}
                </Label>
                <Select value={favStaff} onValueChange={setFavStaff} disabled={readOnly}>
                  <SelectTrigger title={roTitle}>
                    <SelectValue placeholder={t("customers.favoriteStaffNone")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("customers.favoriteStaffNone")}</SelectItem>
                    {staffList
                      .filter((s) => s.is_active)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t("customers.favoriteService")}
                </Label>
                <Select value={favService} onValueChange={setFavService} disabled={readOnly}>
                  <SelectTrigger title={roTitle}>
                    <SelectValue placeholder={t("customers.favoriteServiceNone")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("customers.favoriteServiceNone")}</SelectItem>
                    {services
                      .filter((s) => s.is_active)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="allergies" className="text-xs font-medium text-muted-foreground">
                  {t("customers.allergies")}
                </Label>
                <Textarea
                  id="allergies"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  rows={3}
                  placeholder={t("customers.allergiesPlaceholder")}
                  disabled={readOnly}
                  title={roTitle}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t("customers.communication")}
                </Label>
                <Select
                  value={communication}
                  onValueChange={(v) => setCommunication(v as typeof communication)}
                  disabled={readOnly}
                >
                  <SelectTrigger title={roTitle}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">{t("customers.commEmail")}</SelectItem>
                    <SelectItem value="sms">{t("customers.commSms")}</SelectItem>
                    <SelectItem value="any">{t("customers.commAny")}</SelectItem>
                    <SelectItem value="none">{t("customers.commNone")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  variant="hero"
                  onClick={savePreferences}
                  disabled={update.isPending || readOnly}
                  title={roTitle}
                >
                  <Save className="h-4 w-4" />{" "}
                  {update.isPending ? t("customers.saving") : t("customers.savePreferences")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ShopLayout>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "bad";
}) {
  const toneCls =
    tone === "ok"
      ? "text-mint-foreground"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneCls)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
