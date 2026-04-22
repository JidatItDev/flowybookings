import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Sparkles, Search, Users, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { MobileFormDialog } from "@/components/MobileFormDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, LoadingGrid, NoShopState } from "@/components/EmptyState";
import { MobileActionSheet, useStandardRowActions } from "@/components/MobileActionSheet";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useImpersonationReadOnly, assertNotImpersonating } from "@/components/ImpersonationBanner";
import { useActiveShopId } from "@/lib/shop-context";
import { servicesQuery, staffQuery, bookingsQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { logActivity } from "@/lib/activity-log";

export const Route = createFileRoute("/shop/services")({ head: () => ({ meta: [{ title: "Services — FlowyBookings" }] }), component: ServicesPage });

const categoryColors: Record<string, string> = { Hair: "bg-primary-soft text-primary", Nails: "bg-pink text-pink-foreground", Beauty: "bg-peach text-peach-foreground", Tattoo: "bg-info/15 text-info-foreground", Pet: "bg-mint text-mint-foreground" };
type ServiceRow = { id: string; name: string; description: string | null; category: string | null; duration_minutes: number; price_cents: number; deposit_cents: number; is_active: boolean; currency: string };
type StaffServiceLink = { staff_id: string; service_id: string };
type SortKey = "all" | "popular" | "priceHigh" | "durShort" | "durLong";

function ServicesPage() {
  const shopId = useActiveShopId(); const qc = useQueryClient(); const { t } = useT();
  const readOnly = useImpersonationReadOnly();
  const roTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ServiceRow | null>(null);
  const [sheetFor, setSheetFor] = useState<ServiceRow | null>(null);
  const [duplicateSeed, setDuplicateSeed] = useState<ServiceRow | null>(null);
  const [viewing, setViewing] = useState<ServiceRow | null>(null);

  // ── Search & filter (UI-only) ──
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("all");
  const [cat, setCat] = useState<string>("__all__");

  const { data: services = [], isLoading } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });
  // Reuse existing queries — do NOT duplicate. staffQuery is keyed via shopKeys.staff(shopId);
  // staff_services uses the same key as src/routes/shop.staff.tsx so the cache is shared.
  const { data: staff = [] } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId });
  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: staffLinks = [] } = useQuery<StaffServiceLink[]>({
    queryKey: ["staff_services", shopId],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_services").select("staff_id,service_id");
      if (error) throw error;
      return (data ?? []) as StaffServiceLink[];
    },
    enabled: !!shopId,
  });

  // Per-service derived stats: bookings count + assigned staff names.
  const stats = useMemo(() => {
    const bookingsByService = new Map<string, number>();
    for (const b of bookings) {
      if (!b.service_id) continue;
      bookingsByService.set(b.service_id, (bookingsByService.get(b.service_id) ?? 0) + 1);
    }
    const staffById = new Map(staff.map((s) => [s.id, s] as const));
    const staffByService = new Map<string, { id: string; name: string }[]>();
    for (const link of staffLinks) {
      const arr = staffByService.get(link.service_id) ?? [];
      const member = staffById.get(link.staff_id);
      if (member) arr.push({ id: member.id, name: member.full_name });
      staffByService.set(link.service_id, arr);
    }
    const max = Math.max(1, ...Array.from(bookingsByService.values()));
    return { bookingsByService, staffByService, maxBookings: max };
  }, [bookings, staff, staffLinks]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) if (s.category) set.add(s.category);
    return Array.from(set).sort();
  }, [services]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = services.filter((s) => {
      if (needle && !s.name.toLowerCase().includes(needle) && !(s.description ?? "").toLowerCase().includes(needle)) return false;
      if (cat !== "__all__" && (s.category ?? "") !== cat) return false;
      return true;
    });
    if (sort === "popular") {
      out = [...out].sort((a, b) => (stats.bookingsByService.get(b.id) ?? 0) - (stats.bookingsByService.get(a.id) ?? 0));
    } else if (sort === "priceHigh") {
      out = [...out].sort((a, b) => b.price_cents - a.price_cents);
    } else if (sort === "durShort") {
      out = [...out].sort((a, b) => a.duration_minutes - b.duration_minutes);
    } else if (sort === "durLong") {
      out = [...out].sort((a, b) => b.duration_minutes - a.duration_minutes);
    }
    return out;
  }, [services, q, cat, sort, stats]);

  const sheetActions = useStandardRowActions({
    onView: sheetFor ? () => setViewing(sheetFor) : null,
    onEdit: sheetFor ? () => setEditing(sheetFor) : null,
    onDuplicate: sheetFor ? () => setDuplicateSeed(sheetFor) : null,
    onDelete: sheetFor ? () => setDeleting(sheetFor) : null,
    disabled: readOnly,
    disabledTitle: roTitle,
  });

  const toggleActive = useMutation({
    mutationFn: async (s: ServiceRow) => { assertNotImpersonating(); const { error } = await supabase.from("services").update({ is_active: !s.is_active }).eq("id", s.id); if (error) throw error; },
    onSuccess: () => { if (shopId) qc.invalidateQueries({ queryKey: shopKeys.services(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { assertNotImpersonating(); const { error } = await supabase.from("services").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success(t("services.deleted")); setDeleting(null); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.services(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ShopLayout>
      <PageHeader title={t("services.title")} description={t("services.description")} actions={<Button variant="hero" onClick={() => setCreating(true)} disabled={!shopId || readOnly} title={roTitle}><Plus className="h-4 w-4" /> {t("services.addService")}</Button>} />

      {/* Sticky search + filter row — reuses Input/Select primitives. */}
      {shopId && services.length > 0 && (
        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("services.searchPlaceholder")}
                inputMode="search"
                className="h-11 pl-9 text-base sm:text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-11 flex-1 text-sm sm:w-[180px] sm:flex-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("services.filterAll")}</SelectItem>
                  <SelectItem value="popular">{t("services.filterPopular")}</SelectItem>
                  <SelectItem value="priceHigh">{t("services.filterPriceHigh")}</SelectItem>
                  <SelectItem value="durShort">{t("services.filterDurationShort")}</SelectItem>
                  <SelectItem value="durLong">{t("services.filterDurationLong")}</SelectItem>
                </SelectContent>
              </Select>
              {categories.length > 0 && (
                <Select value={cat} onValueChange={setCat}>
                  <SelectTrigger className="h-11 flex-1 text-sm sm:w-[160px] sm:flex-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t("services.filterAllCategories")}</SelectItem>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      )}

      {!shopId ? <NoShopState /> : isLoading ? <LoadingGrid /> : services.length === 0 ? (
        <EmptyState icon={Sparkles} title={t("services.noServices")} description={t("services.noServicesDesc")} action={<Button variant="hero" onClick={() => setCreating(true)} disabled={readOnly} title={roTitle}><Plus className="h-4 w-4" /> {t("services.addService")}</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("services.noResults")} description={t("services.noResultsDesc")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const bookingsCount = stats.bookingsByService.get(s.id) ?? 0;
            const assignedStaff = stats.staffByService.get(s.id) ?? [];
            const isPopular = bookingsCount > 0 && bookingsCount >= stats.maxBookings * 0.6;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (window.matchMedia("(min-width: 640px)").matches) return;
                  if ((e.target as HTMLElement).closest("button")) return;
                  setSheetFor(s);
                }}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && window.innerWidth < 640) {
                    e.preventDefault();
                    setSheetFor(s);
                  }
                }}
                className="rounded-2xl border border-border bg-card p-5 shadow-soft transition active:scale-[0.99] sm:active:scale-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.category && <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", categoryColors[s.category] ?? "bg-muted text-muted-foreground")}>{s.category}</span>}
                      {isPopular && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-peach px-2 py-0.5 text-[10px] font-semibold uppercase text-peach-foreground">
                          <TrendingUp className="h-2.5 w-2.5" /> {t("services.popular")}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 truncate text-base font-semibold">{s.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {t("services.min", { n: s.duration_minutes })}
                    </p>
                  </div>
                  <button onClick={() => toggleActive.mutate(s)} disabled={readOnly} title={roTitle} className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60", s.is_active ? "bg-mint text-mint-foreground" : "bg-muted text-muted-foreground")}>{s.is_active ? t("services.active") : t("services.inactive")}</button>
                </div>

                {/* Insights row: assigned staff + bookings count */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {assignedStaff.length === 0
                      ? t("services.noStaff")
                      : assignedStaff.length <= 2
                        ? assignedStaff.map((m) => m.name).join(", ")
                        : `${assignedStaff[0].name} +${assignedStaff.length - 1}`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{bookingsCount === 0 ? t("services.noBookings") : t("services.bookingsCount", { n: bookingsCount })}</span>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">{formatCents(s.price_cents, s.currency)}</p>
                    {s.deposit_cents > 0 && <p className="text-xs text-muted-foreground">{t("services.deposit", { amount: formatCents(s.deposit_cents, s.currency) })}</p>}
                  </div>
                  {/* Inline icon buttons — desktop/tablet only; mobile uses the action sheet. */}
                  <div className="hidden gap-1 sm:flex">
                    <Button variant="ghost" size="icon" disabled={readOnly} title={roTitle} onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={readOnly} title={roTitle} onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ServiceFormDialog
        open={creating || !!editing || !!duplicateSeed}
        onClose={() => { setCreating(false); setEditing(null); setDuplicateSeed(null); }}
        service={editing}
        duplicateOf={duplicateSeed}
        shopId={shopId}
      />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("services.deleteService")}</AlertDialogTitle><AlertDialogDescription>{t("services.deleteDesc", { name: deleting?.name ?? "" })}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("services.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("services.delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileActionSheet
        open={!!sheetFor}
        onClose={() => setSheetFor(null)}
        title={sheetFor?.name ?? ""}
        description={sheetFor ? formatCents(sheetFor.price_cents, sheetFor.currency) : undefined}
        actions={sheetActions}
      />

      <ServiceViewSheet
        service={viewing}
        onClose={() => setViewing(null)}
        staffNames={viewing ? (stats.staffByService.get(viewing.id) ?? []).map((s) => s.name) : []}
        bookingsCount={viewing ? stats.bookingsByService.get(viewing.id) ?? 0 : 0}
        onEdit={() => { if (viewing) { setEditing(viewing); setViewing(null); } }}
        readOnly={readOnly}
        roTitle={roTitle}
      />

      {shopId && (
        <FloatingActionButton
          onClick={() => setCreating(true)}
          disabled={readOnly}
          title={roTitle}
          ariaLabel={t("services.addService")}
        />
      )}
    </ShopLayout>
  );
}

function ServiceFormDialog({ open, onClose, service, duplicateOf, shopId }: { open: boolean; onClose: () => void; service: ServiceRow | null; duplicateOf?: ServiceRow | null; shopId: string | null }) {
  const qc = useQueryClient(); const { t } = useT();
  const [form, setForm] = useState({ name: "", category: "", duration_minutes: 30, price: 0, deposit: 0, is_active: true, description: "" });
  // Reuse the shared staff + staff_services caches — no new queries.
  const { data: allStaff = [] } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId && open });
  const { data: allLinks = [] } = useQuery<StaffServiceLink[]>({
    queryKey: ["staff_services", shopId],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_services").select("staff_id,service_id");
      if (error) throw error;
      return (data ?? []) as StaffServiceLink[];
    },
    enabled: !!shopId && open,
  });
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [pickStaffOpen, setPickStaffOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const seed = service ?? duplicateOf;
    setForm({
      name: duplicateOf ? t("services.copyOf", { name: duplicateOf.name }) : seed?.name ?? "",
      category: seed?.category ?? "",
      duration_minutes: seed?.duration_minutes ?? 30,
      price: seed ? seed.price_cents / 100 : 0,
      deposit: seed ? seed.deposit_cents / 100 : 0,
      is_active: seed?.is_active ?? true,
      description: seed?.description ?? "",
    });
    // Seed staff selection from the source service (edit OR duplicate).
    const srcId = seed?.id;
    setStaffIds(srcId ? allLinks.filter((l) => l.service_id === srcId).map((l) => l.staff_id) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id, duplicateOf?.id, allLinks.length]);

  // Validation: deposit must be ≥ 0 and ≤ price; price must be ≥ 0.
  const priceNum = Number(form.price) || 0;
  const depositNum = Number(form.deposit) || 0;
  const priceError = priceNum < 0 ? t("services.priceNegative") : null;
  const depositError =
    depositNum < 0
      ? t("services.depositNegative")
      : depositNum > priceNum
        ? t("services.depositTooHigh")
        : null;
  const hasErrors = !!priceError || !!depositError;

  const save = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
      if (!shopId) throw new Error(t("errors.noActiveShop"));
      if (hasErrors) throw new Error(depositError ?? priceError ?? "Invalid input");
      const payload = { shop_id: shopId, name: form.name.trim(), category: form.category.trim() || null, description: form.description.trim() || null, duration_minutes: Number(form.duration_minutes) || 30, price_cents: Math.round(priceNum * 100), deposit_cents: Math.round(depositNum * 100), is_active: form.is_active };
      let serviceId: string;
      if (service) {
        const { error } = await supabase.from("services").update(payload).eq("id", service.id); if (error) throw error;
        serviceId = service.id;
      } else {
        // Check of dit de eerste service van de shop is — log alleen dan service_created
        // (admin onboarding-funnel; latere services zijn niet relevant voor de funnel).
        const { count: existingCount } = await supabase
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId);
        const { data: inserted, error } = await supabase.from("services").insert(payload).select("id").single();
        if (error) throw error;
        serviceId = inserted.id;
        if ((existingCount ?? 0) === 0) {
          void logActivity({
            entity: "service",
            action: "service_created",
            shopId,
            metadata: { service_id: inserted.id, name: payload.name, is_first: true },
          });
        }
      }
      // Sync staff_services using the same diff pattern as src/routes/shop.staff.tsx
      // (no new mutation logic — same insert/delete shape, just inverted scope).
      const currentLinks = service ? allLinks.filter((l) => l.service_id === serviceId).map((l) => l.staff_id) : [];
      const desired = new Set(staffIds);
      const have = new Set(currentLinks);
      const toAdd = staffIds.filter((id) => !have.has(id));
      const toRemove = currentLinks.filter((id) => !desired.has(id));
      if (toAdd.length) {
        const { error } = await supabase.from("staff_services").insert(toAdd.map((staff_id) => ({ staff_id, service_id: serviceId })));
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase.from("staff_services").delete().eq("service_id", serviceId).in("staff_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(service ? t("services.updated") : duplicateOf ? t("services.duplicated") : t("services.created"));
      onClose();
      if (shopId) {
        qc.invalidateQueries({ queryKey: shopKeys.services(shopId) });
        qc.invalidateQueries({ queryKey: ["staff_services", shopId] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <MobileFormDialog
      open={open}
      onClose={onClose}
      size="lg"
      title={service ? t("services.editService") : t("services.newService")}
      description={t("services.setDetails")}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="h-11 w-full sm:h-9 sm:w-auto">{t("services.cancel")}</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={!form.name.trim() || hasErrors || save.isPending} className="h-11 w-full sm:h-9 sm:w-auto">
            {save.isPending ? t("services.saving") : service ? t("services.saveChanges") : t("services.createService")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label htmlFor="name">{t("services.name")}</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cat">{t("services.category")}</Label>
            <Input id="cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm" />
          </div>
          <div>
            <Label htmlFor="dur">{t("services.durationMin")}</Label>
            <Input id="dur" type="number" min={1} inputMode="numeric" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} className="h-11 text-base sm:h-9 sm:text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="price">{t("services.priceEur")}</Label>
            <Input id="price" type="number" min={0} step="0.01" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} aria-invalid={!!priceError} className={cn("h-11 text-base sm:h-9 sm:text-sm", priceError && "border-destructive")} />
            {priceError && <p className="mt-1 text-xs text-destructive">{priceError}</p>}
          </div>
          <div>
            <Label htmlFor="dep">{t("services.depositEur")}</Label>
            <Input id="dep" type="number" min={0} step="0.01" inputMode="decimal" max={priceNum || undefined} value={form.deposit} onChange={(e) => setForm({ ...form, deposit: Number(e.target.value) })} aria-invalid={!!depositError} className={cn("h-11 text-base sm:h-9 sm:text-sm", depositError && "border-destructive")} />
            {depositError ? <p className="mt-1 text-xs text-destructive">{depositError}</p> : <p className="mt-1 text-xs text-muted-foreground">{t("services.depositHint")}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="desc">{t("services.descriptionLabel")}</Label>
          <Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="text-base sm:text-sm" />
        </div>

        {/* Staff multi-select — large touch target on mobile, opens a bottom sheet
            (no cramped popover dropdown). Reuses staffQuery + staff_services cache. */}
        <div>
          <Label>{t("services.staff")}</Label>
          <button
            type="button"
            onClick={() => setPickStaffOpen(true)}
            className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-3 text-left text-sm transition hover:bg-muted/50 sm:py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {staffIds.length === 0
                  ? t("services.staffNone")
                  : staffIds.length === allStaff.length && allStaff.length > 0
                    ? t("services.staffAll")
                    : allStaff
                        .filter((s) => staffIds.includes(s.id))
                        .map((s) => s.full_name)
                        .slice(0, 2)
                        .join(", ") + (staffIds.length > 2 ? ` +${staffIds.length - 2}` : "")}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {staffIds.length > 0 ? t("services.staffSelected", { n: staffIds.length }) : ""}
            </span>
          </button>
          <p className="mt-1 text-xs text-muted-foreground">{t("services.staffHint")}</p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">{t("services.activeLabel")}</p>
            <p className="text-xs text-muted-foreground">{t("services.bookable")}</p>
          </div>
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
        </div>
      </div>

      <StaffPickerSheet
        open={pickStaffOpen}
        onClose={() => setPickStaffOpen(false)}
        staff={allStaff.map((s) => ({ id: s.id, name: s.full_name }))}
        selected={staffIds}
        onChange={setStaffIds}
      />
    </MobileFormDialog>
  );
}

/** Full-screen mobile bottom sheet for picking team members for a service.
 *  Replaces the cramped multi-select dropdown with a large-touch-target list. */
function StaffPickerSheet({
  open,
  onClose,
  staff,
  selected,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  staff: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useT();
  const allSelected = staff.length > 0 && selected.length === staff.length;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85dvh] flex-col rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
        <SheetHeader className="px-5 pb-2 pt-1 text-left">
          <SheetTitle>{t("services.staffPickTitle")}</SheetTitle>
          <p className="text-xs text-muted-foreground">{t("services.staffPickDesc")}</p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-2">
          {staff.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("services.staffNone")}</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onChange(allSelected ? [] : staff.map((s) => s.id))}
                className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-3 text-sm font-medium hover:bg-muted/50"
              >
                <span>{t("services.staffAll")}</span>
                <Checkbox checked={allSelected} aria-hidden="true" />
              </button>
              <div className="mt-2 space-y-1">
                {staff.map((s) => {
                  const checked = selected.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onChange(checked ? selected.filter((id) => id !== s.id) : [...selected, s.id])}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm hover:bg-muted/50"
                    >
                      <span className="truncate">{s.name}</span>
                      <Checkbox checked={checked} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="sticky bottom-0 border-t border-border bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <Button variant="hero" onClick={onClose} className="h-11 w-full">{t("services.done")}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Read-only summary opened from the row action sheet's "Bekijken" item.
 *  Bottom sheet on mobile / desktop alike — keeps interaction consistent and
 *  avoids dropping users straight into edit mode. */
function ServiceViewSheet({
  service,
  onClose,
  staffNames,
  bookingsCount,
  onEdit,
  readOnly,
  roTitle,
}: {
  service: ServiceRow | null;
  onClose: () => void;
  staffNames: string[];
  bookingsCount: number;
  onEdit: () => void;
  readOnly: boolean;
  roTitle?: string;
}) {
  const { t } = useT();
  return (
    <Sheet open={!!service} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85dvh] flex-col rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
        <SheetHeader className="px-5 pb-2 pt-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            {service?.category && (
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", categoryColors[service.category] ?? "bg-muted text-muted-foreground")}>
                {service.category}
              </span>
            )}
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", service?.is_active ? "bg-mint text-mint-foreground" : "bg-muted text-muted-foreground")}>
              {service?.is_active ? t("services.active") : t("services.inactive")}
            </span>
          </div>
          <SheetTitle className="mt-1">{service?.name ?? ""}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("services.priceLabel")}</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{service ? formatCents(service.price_cents, service.currency) : ""}</p>
              {service && service.deposit_cents > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">{t("services.deposit", { amount: formatCents(service.deposit_cents, service.currency) })}</p>
              )}
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("services.durationLabel")}</p>
              <p className="mt-1 flex items-center gap-1 text-xl font-semibold tracking-tight">
                <Clock className="h-4 w-4 text-muted-foreground" /> {service ? t("services.min", { n: service.duration_minutes }) : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{bookingsCount === 0 ? t("services.noBookings") : t("services.bookingsCount", { n: bookingsCount })}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("services.staff")}</p>
            <p className="mt-1 text-sm">
              {staffNames.length === 0 ? <span className="text-muted-foreground">{t("services.staffNone")}</span> : staffNames.join(", ")}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("services.descriptionLabel")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {service?.description?.trim() ? service.description : <span className="text-muted-foreground">{t("services.descriptionEmpty")}</span>}
            </p>
          </div>
        </div>
        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <Button variant="outline" onClick={onClose} className="h-11 flex-1">{t("services.close")}</Button>
          <Button variant="hero" onClick={onEdit} disabled={readOnly} title={roTitle} className="h-11 flex-1">
            <Pencil className="h-4 w-4" /> {t("mobileSheet.edit")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
