import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Mail, Phone, Pencil, Trash2, Users, AlertTriangle, ShieldAlert, Upload, SlidersHorizontal, Sparkles, Crown } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MobileFormDialog } from "@/components/MobileFormDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, NoShopState } from "@/components/EmptyState";
import { MobileActionSheet, useStandardRowActions } from "@/components/MobileActionSheet";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useImpersonationReadOnly, assertNotImpersonating } from "@/components/ImpersonationBanner";
import { CustomerImportDialog } from "@/components/CustomerImportDialog";
import { useActiveShopId } from "@/lib/shop-context";
import { customersQuery, bookingsQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, initials, relativeFromNow } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type FilterKey = "all" | "new" | "top" | "risk" | "recent";
const NEW_CUSTOMER_DAYS = 30;
const RECENT_VISIT_DAYS = 30;
const TOP_SPENT_THRESHOLD_CENTS = 20000; // €200+


export const Route = createFileRoute("/shop/customers")({
  head: () => ({ meta: [{ title: "Customers — FlowyBookings" }] }),
  component: CustomersPage,
});

type CustomerRow = { id: string; full_name: string; email: string | null; phone: string | null; notes: string | null; total_spent_cents: number; last_visit_at: string | null; no_show_count?: number; requires_deposit?: boolean; tags?: string[] | null; preferences?: unknown };

function getAllergyText(c: { preferences?: unknown }): string | null {
  const p = c.preferences;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const a = (p as Record<string, unknown>).allergies;
  if (typeof a !== "string") return null;
  const trimmed = a.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function CustomersPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useT();
  const readOnly = useImpersonationReadOnly();
  const roTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [sheetFor, setSheetFor] = useState<CustomerRow | null>(null);

  const sheetActions = useStandardRowActions({
    onView: sheetFor
      ? () => navigate({ to: "/shop/customers/$customerId", params: { customerId: sheetFor.id } })
      : null,
    onEdit: sheetFor ? () => setEditing(sheetFor) : null,
    onDelete: sheetFor ? () => setDeleting(sheetFor) : null,
    disabled: readOnly,
    disabledTitle: roTitle,
  });

  const { data: customers = [], isLoading } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId });
  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const visitsByCustomer = useMemo(
    () =>
      bookings.reduce<Record<string, number>>((acc, b) => {
        if (b.customer_id && (b.status === "completed" || b.status === "confirmed"))
          acc[b.customer_id] = (acc[b.customer_id] ?? 0) + 1;
        return acc;
      }, {}),
    [bookings],
  );

  const remove = useMutation({
    mutationFn: async (id: string) => { assertNotImpersonating(); const { error } = await supabase.from("customers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success(t("customers.deleted")); setDeleting(null); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.customers(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const now = Date.now();
    return customers.filter((c) => {
      if (needle) {
        const hit =
          c.full_name.toLowerCase().includes(needle) ||
          (c.email ?? "").toLowerCase().includes(needle) ||
          (c.phone ?? "").toLowerCase().includes(needle);
        if (!hit) return false;
      }
      if (filter === "all") return true;
      const createdAt = (c as { created_at?: string }).created_at;
      if (filter === "new") {
        if (!createdAt) return false;
        return (now - new Date(createdAt).getTime()) / 86_400_000 <= NEW_CUSTOMER_DAYS;
      }
      if (filter === "top") return (c.total_spent_cents ?? 0) >= TOP_SPENT_THRESHOLD_CENTS;
      if (filter === "risk") return (c.no_show_count ?? 0) >= 2 || c.requires_deposit === true;
      if (filter === "recent") {
        if (!c.last_visit_at) return false;
        return (now - new Date(c.last_visit_at).getTime()) / 86_400_000 <= RECENT_VISIT_DAYS;
      }
      return true;
    });
  }, [customers, q, filter]);

  function badgesFor(c: CustomerRow): Array<"new" | "vip" | "noshow"> {
    const out: Array<"new" | "vip" | "noshow"> = [];
    const createdAt = (c as { created_at?: string }).created_at;
    if (createdAt) {
      const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
      if (ageDays <= NEW_CUSTOMER_DAYS) out.push("new");
    }
    if ((c.total_spent_cents ?? 0) >= TOP_SPENT_THRESHOLD_CENTS) out.push("vip");
    if ((c.no_show_count ?? 0) >= 2) out.push("noshow");
    return out;
  }

  return (
    <ShopLayout>
      <PageHeader
        title={t("customers.title")}
        description={t("customers.description")}
        actions={
          // Tablet+ only — mobile uses the dedicated action row below + FAB.
          <div className="hidden sm:flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setImporting(true)} disabled={!shopId || readOnly} title={roTitle}>
              <Upload className="h-4 w-4" /> {t("customerImport.cta")}
            </Button>
            <Button variant="hero" onClick={() => setCreating(true)} disabled={!shopId || readOnly} title={roTitle}>
              <Plus className="h-4 w-4" /> {t("customers.newCustomer")}
            </Button>
          </div>
        }
      />
      {!shopId ? <NoShopState /> : (
        <>
          {/* Mobile-only secondary action row — Import as outlined secondary,
              compact and never clipped (Filter lives in the search row below). */}
          <div className="mb-3 flex items-center gap-2 sm:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImporting(true)}
              disabled={!shopId || readOnly}
              title={roTitle}
              className="h-9 flex-1 justify-center rounded-xl"
            >
              <Upload className="h-4 w-4" /> {t("customerImport.cta")}
            </Button>
          </div>

          {/* Sticky search + filter bar */}
          <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
            <div className="flex w-full min-w-0 items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 shadow-xs sm:max-w-md">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("customers.searchPlaceholder")}
                  className="h-11 w-full min-w-0 flex-1 bg-transparent text-base outline-none sm:h-10 sm:text-sm"
                  inputMode="search"
                  autoComplete="off"
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
                <SelectTrigger
                  aria-label={t("customers.filterLabel")}
                  className={cn(
                    // Mobile: clean 44×44 square icon button — no chevron, no label, never shrinks.
                    "h-11 w-11 shrink-0 justify-center rounded-xl border-border bg-card p-0",
                    "[&>svg:last-child]:hidden",
                    // Tablet+: compact icon+label trigger that won't overflow narrow tablets.
                    "sm:h-10 sm:w-auto sm:min-w-[44px] sm:gap-2 sm:px-3 sm:[&>svg:last-child]:inline-block",
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">
                    <SelectValue placeholder={t("customers.filterLabel")} />
                  </span>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="all">{t("customers.filterAll")}</SelectItem>
                  <SelectItem value="new">{t("customers.filterNew")}</SelectItem>
                  <SelectItem value="top">{t("customers.filterTop")}</SelectItem>
                  <SelectItem value="risk">{t("customers.filterRisk")}</SelectItem>
                  <SelectItem value="recent">{t("customers.filterRecent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isLoading && (
              <p className="mt-2 text-[11px] text-muted-foreground sm:hidden">
                {t("customers.resultsCount", { count: String(list.length) })}
              </p>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2 sm:hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
              <div className="hidden sm:block">
                <Skeleton className="h-72 w-full rounded-2xl" />
              </div>
            </div>
          ) : list.length === 0 ? (
            // Bottom padding (mobile) reserves space so the floating + button
            // never visually collides with the empty-state card.
            <div className="pb-28 sm:pb-0">
              <EmptyState
                icon={Users}
                title={q || filter !== "all" ? t("customers.noMatches") : t("customers.noCustomers")}
                description={q || filter !== "all" ? t("customers.noMatchDesc") : t("customers.noCustomersDesc")}
                action={
                  !q && filter === "all" ? (
                    // On mobile the FloatingActionButton is the canonical create CTA
                    // — hide this duplicate button so the empty state stays uncluttered.
                    <Button variant="hero" onClick={() => setCreating(true)} disabled={readOnly} title={roTitle} className="hidden sm:inline-flex">
                      <Plus className="h-4 w-4" /> {t("customers.addCustomer")}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              {/* Mobile card list — tap opens MobileActionSheet (View/Edit/Delete). */}
              <div className="space-y-2 pb-24 sm:hidden">
                {list.map((c) => {
                  const ns = c.no_show_count ?? 0;
                  const repeat = ns >= 2;
                  const allergy = getAllergyText(c);
                  const visits = visitsByCustomer[c.id] ?? 0;
                  const badges = badgesFor(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSheetFor(c)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-soft transition active:scale-[0.99]",
                        (repeat || allergy) && "border-destructive/40 bg-destructive/5",
                      )}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-warm text-sm font-semibold text-pink-foreground">
                        {initials(c.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-base font-semibold">{c.full_name}</p>
                          {allergy && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
                        </div>
                        {badges.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {badges.includes("new") && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                                <Sparkles className="h-2.5 w-2.5" /> {t("customers.badgeNew")}
                              </span>
                            )}
                            {badges.includes("vip") && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                                <Crown className="h-2.5 w-2.5" /> {t("customers.badgeVip")}
                              </span>
                            )}
                            {badges.includes("noshow") && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                                <ShieldAlert className="h-2.5 w-2.5" /> {t("customers.badgeNoShow")}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {c.phone ?? c.email ?? "—"}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>
                            {visits} {visits === 1 ? t("customers.visitsOne") : t("customers.visitsMany")}
                          </span>
                          <span>·</span>
                          <span className="font-medium text-foreground tabular-nums">
                            {formatCents(c.total_spent_cents)}
                          </span>
                          {c.last_visit_at && (
                            <>
                              <span>·</span>
                              <span className="truncate">{relativeFromNow(c.last_visit_at)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Desktop / tablet — original table preserved. */}
              <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-soft sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 text-left">{t("customers.customerCol")}</th>
                      <th className="hidden px-6 py-3 text-left md:table-cell">{t("customers.contact")}</th>
                      <th className="hidden px-6 py-3 text-left sm:table-cell">Bezoeken</th>
                      <th className="hidden px-6 py-3 text-left sm:table-cell">{t("customers.totalSpent")}</th>
                      <th className="hidden px-6 py-3 text-left lg:table-cell">{t("customers.lastVisit")}</th>
                      <th className="hidden px-6 py-3 text-left sm:table-cell">{t("customers.noShows")}</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((c) => {
                      const ns = c.no_show_count ?? 0;
                      const repeat = ns >= 2;
                      const allergy = getAllergyText(c);
                      return (
                      <tr
                        key={c.id}
                        onClick={() => navigate({ to: "/shop/customers/$customerId", params: { customerId: c.id } })}
                        className={cn("cursor-pointer hover:bg-muted/30", (repeat || allergy) && "bg-destructive/5")}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-warm text-xs font-semibold text-pink-foreground">{initials(c.full_name)}</div>
                            <div className="min-w-0">
                              <p className="truncate font-medium flex items-center gap-2 flex-wrap">
                                {c.full_name}
                                {allergy && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive ring-1 ring-destructive/30"
                                    title={allergy}
                                  >
                                    <AlertTriangle className="h-3 w-3" /> {t("customers.allergyBadge")}
                                  </span>
                                )}
                                {repeat && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                                    <ShieldAlert className="h-3 w-3" /> {t("customers.repeatNoShow")}
                                  </span>
                                )}
                                {c.requires_deposit && (
                                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                                    {t("customers.depositRequired")}
                                  </span>
                                )}
                                {(c.tags ?? []).slice(0, 3).map((tg) => (
                                  <span key={tg} className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                                    {tg}
                                  </span>
                                ))}
                              </p>
                              {allergy && (
                                <p className="truncate text-xs font-medium text-destructive" title={allergy}>
                                  ⚠ {allergy}
                                </p>
                              )}
                              {c.notes && <p className="truncate text-xs text-muted-foreground">{c.notes}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-6 py-4 text-xs text-muted-foreground md:table-cell">{c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{c.email}</div>}{c.phone && <div className="mt-1 flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{c.phone}</div>}</td>
                        <td className="hidden px-6 py-4 sm:table-cell"><span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{visitsByCustomer[c.id] ?? 0}</span></td>
                        <td className="hidden px-6 py-4 sm:table-cell"><span className="font-medium text-success-foreground tabular-nums">{formatCents(c.total_spent_cents)}</span></td>
                        <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{relativeFromNow(c.last_visit_at)}</td>
                        <td className="hidden px-6 py-4 sm:table-cell">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", ns === 0 ? "bg-mint/40 text-mint-foreground" : ns === 1 ? "bg-amber-500/15 text-amber-700" : "bg-destructive/15 text-destructive")}>
                            {ns > 0 && <AlertTriangle className="h-3 w-3" />} {ns}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="icon" disabled={readOnly} title={roTitle} onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" disabled={readOnly} title={roTitle} onClick={() => setDeleting(c)}><Trash2 className="h-4 w-4" /></Button></td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      <CustomerFormDialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} customer={editing} shopId={shopId} />
      <CustomerImportDialog open={importing} onClose={() => setImporting(false)} shopId={shopId} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customers.deleteTitle", { name: deleting?.full_name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("customers.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("customers.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("customers.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileActionSheet
        open={!!sheetFor}
        onClose={() => setSheetFor(null)}
        title={sheetFor?.full_name ?? ""}
        description={sheetFor?.email ?? sheetFor?.phone ?? undefined}
        actions={sheetActions}
      />

      {shopId && (
        <FloatingActionButton
          onClick={() => setCreating(true)}
          disabled={readOnly}
          title={roTitle}
          ariaLabel={t("customers.newCustomer")}
        />
      )}
    </ShopLayout>
  );
}

function CustomerFormDialog({ open, onClose, customer, shopId }: { open: boolean; onClose: () => void; customer: CustomerRow | null; shopId: string | null }) {
  const qc = useQueryClient();
  const { t } = useT();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", notes: "", requires_deposit: false });
  useEffect(() => {
    if (!open) return;
    setForm({ full_name: customer?.full_name ?? "", email: customer?.email ?? "", phone: customer?.phone ?? "", notes: customer?.notes ?? "", requires_deposit: customer?.requires_deposit ?? false });
  }, [open, customer?.id]);

  const save = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
      if (!shopId) throw new Error(t("errors.noActiveShop"));
      const payload = { shop_id: shopId, full_name: form.full_name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, notes: form.notes.trim() || null, requires_deposit: form.requires_deposit };
      if (customer) { const { error } = await supabase.from("customers").update(payload).eq("id", customer.id); if (error) throw error; }
      else { const { error } = await supabase.from("customers").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(customer ? t("customers.updated") : t("customers.added")); onClose(); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.customers(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ns = customer?.no_show_count ?? 0;

  return (
    <MobileFormDialog
      open={open}
      onClose={onClose}
      title={customer ? t("customers.editCustomer") : t("customers.newCustomerTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="h-11 w-full sm:h-9 sm:w-auto">{t("customers.cancel")}</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={!form.full_name.trim() || save.isPending} className="h-11 w-full sm:h-9 sm:w-auto">
            {save.isPending ? t("customers.saving") : customer ? t("customers.saveChanges") : t("customers.addCustomer")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {customer && (
          <div className={cn("rounded-lg border px-3 py-2 text-xs flex items-center justify-between", ns >= 2 ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-muted-foreground")}>
            <span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> {t("customers.noShowsLabel")}</span>
            <span className="font-semibold">{ns}</span>
          </div>
        )}
        <div><Label htmlFor="fn">{t("customers.fullName")}</Label><Input id="fn" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm" /></div>
        <div><Label htmlFor="em">{t("customers.email")}</Label><Input id="em" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm" /></div>
        <div><Label htmlFor="ph">{t("customers.phone")}</Label><Input id="ph" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm" /></div>
        <div><Label htmlFor="nt">{t("customers.notes")}</Label><Textarea id="nt" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="text-base sm:text-sm" /></div>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={form.requires_deposit} onChange={(e) => setForm({ ...form, requires_deposit: e.target.checked })} />
          <span>
            <span className="font-medium">{t("customers.requireDeposit")}</span>
            <span className="block text-xs text-muted-foreground">{t("customers.requireDepositHint")}</span>
          </span>
        </label>
      </div>
    </MobileFormDialog>
  );
}
