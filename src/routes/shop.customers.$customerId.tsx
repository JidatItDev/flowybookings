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
} from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import { bookingsQuery, servicesQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, formatDateTime, initials, relativeFromNow } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop/customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer profile — FlowyBookings" }] }),
  component: CustomerProfilePage,
});

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
  created_at: string;
};

const SUGGESTED_TAGS = ["VIP", "New", "Risky", "Loyal", "Walk-in"];

function CustomerProfilePage() {
  const shopId = useActiveShopId();
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useT();

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

  const customerBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.customer_id === customerId)
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()),
    [bookings, customerId],
  );

  const serviceMap = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services]);

  const customer = customerQuery.data;

  // Local editable state
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [requiresDeposit, setRequiresDeposit] = useState(false);

  useEffect(() => {
    if (customer) {
      setNotes(customer.notes ?? "");
      setTags(customer.tags ?? []);
      setRequiresDeposit(customer.requires_deposit);
    }
  }, [customer?.id]);

  const update = useMutation({
    mutationFn: async (patch: { notes?: string | null; tags?: string[]; requires_deposit?: boolean }) => {
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
                      className="rounded-full p-0.5 hover:bg-primary/20"
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  className="h-9 max-w-xs"
                />
                <Button size="sm" variant="outline" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>
                  <Plus className="h-4 w-4" /> {t("customers.addTag")}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTED_TAGS.filter((s) => !tags.includes(s)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addTag(s)}
                    className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Booking history */}
          <div className="rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-sm font-semibold">{t("customers.bookingHistory")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("customers.bookingHistoryCount", { count: String(totalBookings) })}
                </p>
              </div>
            </div>
            {customerBookings.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("customers.noBookings")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {customerBookings.map((b) => {
                  const svc = b.service_id ? serviceMap[b.service_id] : null;
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/30">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {svc?.name ?? t("customers.serviceRemoved")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{formatDateTime(b.starts_at)}</p>
                      </div>
                      <StatusBadge status={b.status} />
                      <span className="w-20 text-right text-sm font-medium tabular-nums">
                        {formatCents(b.price_cents)}
                      </span>
                    </li>
                  );
                })}
              </ul>
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
            />
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={requiresDeposit}
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
                disabled={update.isPending}
              >
                <Save className="h-4 w-4" /> {update.isPending ? t("customers.saving") : t("customers.saveNotes")}
              </Button>
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
