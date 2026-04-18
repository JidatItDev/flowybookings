import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Filter, CalendarDays, UserX } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import {
  bookingsQuery, customersQuery, servicesQuery, shopKeys, staffQuery,
  type BookingWithRelations,
} from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop/calendar")({
  head: () => ({ meta: [{ title: "Calendar — FlowyBookings" }] }),
  component: CalendarPage,
});

const statuses = ["all", "pending", "confirmed", "completed", "cancelled", "no_show"] as const;

function CalendarPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const { t } = useT();
  const [filter, setFilter] = useState<(typeof statuses)[number]>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BookingWithRelations | null>(null);
  const [deleting, setDeleting] = useState<BookingWithRelations | null>(null);

  const statusLabel: Record<string, string> = {
    all: t("calendar.filterAll"), pending: t("calendar.pending"), confirmed: t("calendar.confirmed"),
    completed: t("calendar.completed"), cancelled: t("calendar.cancelled"), no_show: t("calendar.noShow"),
  };

  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: customers = [] } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId });
  const { data: services = [] } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });
  const { data: staff = [] } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingWithRelations["status"] }) => {
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("calendar.bookingUpdated"));
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.bookings(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("calendar.bookingDeleted"));
      setDeleting(null);
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.bookings(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = bookings.filter((b) => filter === "all" || b.status === filter);

  return (
    <ShopLayout>
      <PageHeader
        title={t("calendar.title")}
        description={t("calendar.description")}
        actions={
          <Button variant="hero" onClick={() => setCreating(true)} disabled={!shopId}>
            <Plus className="h-4 w-4" /> {t("calendar.newBooking")}
          </Button>
        }
      />

      {!shopId ? (
        <NoShopState />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize",
                  filter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {statusLabel[s]}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="px-2 text-sm font-medium">{t("calendar.allUpcoming")}</span>
              <Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={filter === "all" ? t("calendar.noBookings") : t("calendar.noMatch")}
              description={filter === "all" ? t("calendar.noBookingsDesc") : t("calendar.noMatchDesc")}
              action={filter === "all" && (
                <Button variant="hero" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> {t("calendar.newBooking")}
                </Button>
              )}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">{t("calendar.when")}</th>
                    <th className="hidden px-4 py-3 text-left sm:table-cell">{t("calendar.customer")}</th>
                    <th className="hidden px-4 py-3 text-left md:table-cell">{t("calendar.service")}</th>
                    <th className="hidden px-4 py-3 text-left lg:table-cell">{t("calendar.staffCol")}</th>
                    <th className="px-4 py-3 text-left">{t("calendar.status")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((b) => {
                    const cust = customers.find((c) => c.id === b.customer_id);
                    const svc = services.find((s) => s.id === b.service_id);
                    const stf = staff.find((s) => s.id === b.staff_id);
                    return (
                      <tr key={b.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium">{formatTime(b.starts_at)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(b.starts_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}
                          </p>
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">{cust?.full_name ?? "—"}</td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{svc?.name ?? "—"}</td>
                        <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{stf?.full_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Select value={b.status} onValueChange={(v) => updateStatus.mutate({ id: b.id, status: v as BookingWithRelations["status"] })}>
                            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {statuses.filter((s) => s !== "all").map((s) => (
                                <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {b.status !== "no_show" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => updateStatus.mutate({ id: b.id, status: "no_show" })}
                              title={t("calendar.markNoShow")}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>{t("calendar.edit")}</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(b)}>{t("calendar.delete")}</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <BookingFormDialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} booking={editing} shopId={shopId} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calendar.deleteBooking")}</AlertDialogTitle>
            <AlertDialogDescription>{t("calendar.deleteBookingDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("calendar.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("calendar.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShopLayout>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function BookingFormDialog({ open, onClose, booking, shopId }: { open: boolean; onClose: () => void; booking: BookingWithRelations | null; shopId: string | null }) {
  const qc = useQueryClient();
  const { t } = useT();
  const { data: customers = [] } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId && open });
  const { data: services = [] } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId && open });
  const { data: staff = [] } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId && open });

  const statusLabel: Record<string, string> = {
    pending: t("calendar.pending"), confirmed: t("calendar.confirmed"),
    completed: t("calendar.completed"), cancelled: t("calendar.cancelled"), no_show: t("calendar.noShow"),
  };

  const [form, setForm] = useState({ customer_id: "", service_id: "", staff_id: "", starts_at: "", duration: 60, status: "pending" as BookingWithRelations["status"], notes: "" });

  // Reset / hydrate the form whenever the dialog opens or the edited booking changes.
  // Doing this in useEffect (instead of during render) avoids the infinite-render
  // loop that previously crashed the page when "Nieuwe boeking" was clicked.
  useEffect(() => {
    if (!open) return;
    const dur = booking ? Math.round((+new Date(booking.ends_at) - +new Date(booking.starts_at)) / 60000) : 60;
    setForm({
      customer_id: booking?.customer_id ?? "",
      service_id: booking?.service_id ?? "",
      staff_id: booking?.staff_id ?? "",
      starts_at: toLocalInput(booking?.starts_at ?? null),
      duration: dur,
      status: booking?.status ?? "pending",
      notes: booking?.notes ?? "",
    });
  }, [open, booking?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No active shop");
      if (!form.starts_at) throw new Error("Pick a start time");
      const svc = services.find((s) => s.id === form.service_id);
      const startUtc = new Date(form.starts_at + "Z");
      const ends = new Date(startUtc.getTime() + form.duration * 60000);
      const payload = { shop_id: shopId, customer_id: form.customer_id || null, service_id: form.service_id || null, staff_id: form.staff_id || null, starts_at: startUtc.toISOString(), ends_at: ends.toISOString(), status: form.status, price_cents: svc?.price_cents ?? booking?.price_cents ?? 0, deposit_cents: svc?.deposit_cents ?? booking?.deposit_cents ?? 0, notes: form.notes || null };
      if (booking) { const { error } = await supabase.from("bookings").update(payload).eq("id", booking.id); if (error) throw error; }
      else { const { error } = await supabase.from("bookings").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(booking ? t("calendar.bookingUpdated") : t("calendar.bookingCreated")); onClose(); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.bookings(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{booking ? t("calendar.editBooking") : t("calendar.newBookingTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>{t("calendar.customer")}</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder={t("calendar.pickCustomer")} /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("calendar.service")}</Label>
              <Select value={form.service_id} onValueChange={(v) => { const svc = services.find((s) => s.id === v); setForm({ ...form, service_id: v, duration: svc?.duration_minutes ?? form.duration }); }}>
                <SelectTrigger><SelectValue placeholder={t("calendar.pickService")} /></SelectTrigger>
                <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("calendar.staffCol")}</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("calendar.pickStaff")} /></SelectTrigger>
                <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="dt">{t("calendar.startUTC")}</Label><Input id="dt" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
            <div><Label htmlFor="du">{t("calendar.duration")}</Label><Input id="du" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} /></div>
          </div>
          <div>
            <Label>{t("calendar.status")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as BookingWithRelations["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["pending", "confirmed", "completed", "cancelled", "no_show"] as const).map((s) => <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="nt">{t("calendar.notes")}</Label><Input id="nt" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("calendar.cancel")}</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("calendar.saving") : booking ? t("calendar.save") : t("calendar.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
