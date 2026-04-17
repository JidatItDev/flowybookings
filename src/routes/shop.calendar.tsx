import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Filter, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import {
  bookingsQuery,
  customersQuery,
  servicesQuery,
  shopKeys,
  staffQuery,
  type BookingWithRelations,
} from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Bookly" }] }),
  component: CalendarPage,
});

const statuses = ["all", "pending", "confirmed", "completed", "cancelled", "no_show"] as const;
const statusLabel: Record<string, string> = {
  all: "all",
  pending: "pending",
  confirmed: "confirmed",
  completed: "completed",
  cancelled: "cancelled",
  no_show: "no-show",
};

function CalendarPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof statuses)[number]>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BookingWithRelations | null>(null);
  const [deleting, setDeleting] = useState<BookingWithRelations | null>(null);

  const { data: bookings = [] } = useQuery({
    ...bookingsQuery(shopId ?? ""),
    enabled: !!shopId,
  });
  const { data: customers = [] } = useQuery({
    ...customersQuery(shopId ?? ""),
    enabled: !!shopId,
  });
  const { data: services = [] } = useQuery({
    ...servicesQuery(shopId ?? ""),
    enabled: !!shopId,
  });
  const { data: staff = [] } = useQuery({
    ...staffQuery(shopId ?? ""),
    enabled: !!shopId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingWithRelations["status"] }) => {
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking updated");
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
      toast.success("Booking deleted");
      setDeleting(null);
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.bookings(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = bookings.filter((b) => filter === "all" || b.status === filter);

  return (
    <ShopLayout>
      <PageHeader
        title="Calendar"
        description="View and manage upcoming appointments."
        actions={
          <Button variant="hero" onClick={() => setCreating(true)} disabled={!shopId}>
            <Plus className="h-4 w-4" /> New booking
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
                  filter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {statusLabel[s]}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm font-medium">All upcoming</span>
              <Button variant="ghost" size="icon">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={filter === "all" ? "No bookings yet" : "No bookings match this filter"}
              description={
                filter === "all"
                  ? "Create your first booking to get started."
                  : "Try a different status filter."
              }
              action={
                filter === "all" && (
                  <Button variant="hero" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" /> New booking
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">When</th>
                    <th className="hidden px-4 py-3 text-left sm:table-cell">Customer</th>
                    <th className="hidden px-4 py-3 text-left md:table-cell">Service</th>
                    <th className="hidden px-4 py-3 text-left lg:table-cell">Staff</th>
                    <th className="px-4 py-3 text-left">Status</th>
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
                            {new Date(b.starts_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              timeZone: "UTC",
                            })}
                          </p>
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          {cust?.full_name ?? "—"}
                        </td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                          {svc?.name ?? "—"}
                        </td>
                        <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                          {stf?.full_name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={b.status}
                            onValueChange={(v) =>
                              updateStatus.mutate({
                                id: b.id,
                                status: v as BookingWithRelations["status"],
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statuses
                                .filter((s) => s !== "all")
                                .map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {statusLabel[s]}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(b)}>
                            Delete
                          </Button>
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

      <BookingFormDialog
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        booking={editing}
        shopId={shopId}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete booking?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && remove.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
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
  // yyyy-MM-ddTHH:mm in UTC for stable cross-tz behaviour
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function BookingFormDialog({
  open,
  onClose,
  booking,
  shopId,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingWithRelations | null;
  shopId: string | null;
}) {
  const qc = useQueryClient();
  const { data: customers = [] } = useQuery({
    ...customersQuery(shopId ?? ""),
    enabled: !!shopId && open,
  });
  const { data: services = [] } = useQuery({
    ...servicesQuery(shopId ?? ""),
    enabled: !!shopId && open,
  });
  const { data: staff = [] } = useQuery({
    ...staffQuery(shopId ?? ""),
    enabled: !!shopId && open,
  });

  const [form, setForm] = useState({
    customer_id: "",
    service_id: "",
    staff_id: "",
    starts_at: "",
    duration: 60,
    status: "pending" as BookingWithRelations["status"],
    notes: "",
  });
  const [lastId, setLastId] = useState<string | null>(null);
  if (open && booking?.id !== lastId) {
    setLastId(booking?.id ?? null);
    const dur = booking
      ? Math.round((+new Date(booking.ends_at) - +new Date(booking.starts_at)) / 60000)
      : 60;
    setForm({
      customer_id: booking?.customer_id ?? "",
      service_id: booking?.service_id ?? "",
      staff_id: booking?.staff_id ?? "",
      starts_at: toLocalInput(booking?.starts_at ?? null),
      duration: dur,
      status: booking?.status ?? "pending",
      notes: booking?.notes ?? "",
    });
  }
  if (!open && lastId !== null) setLastId(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No active shop");
      if (!form.starts_at) throw new Error("Pick a start time");
      const svc = services.find((s) => s.id === form.service_id);
      const startUtc = new Date(form.starts_at + "Z");
      const ends = new Date(startUtc.getTime() + form.duration * 60000);
      const payload = {
        shop_id: shopId,
        customer_id: form.customer_id || null,
        service_id: form.service_id || null,
        staff_id: form.staff_id || null,
        starts_at: startUtc.toISOString(),
        ends_at: ends.toISOString(),
        status: form.status,
        price_cents: svc?.price_cents ?? booking?.price_cents ?? 0,
        deposit_cents: svc?.deposit_cents ?? booking?.deposit_cents ?? 0,
        notes: form.notes || null,
      };
      if (booking) {
        const { error } = await supabase.from("bookings").update(payload).eq("id", booking.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bookings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(booking ? "Booking updated" : "Booking created");
      onClose();
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.bookings(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{booking ? "Edit booking" : "New booking"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Customer</Label>
            <Select
              value={form.customer_id}
              onValueChange={(v) => setForm({ ...form, customer_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Service</Label>
              <Select
                value={form.service_id}
                onValueChange={(v) => {
                  const svc = services.find((s) => s.id === v);
                  setForm({
                    ...form,
                    service_id: v,
                    duration: svc?.duration_minutes ?? form.duration,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Staff</Label>
              <Select
                value={form.staff_id}
                onValueChange={(v) => setForm({ ...form, staff_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dt">Start (UTC)</Label>
              <Input
                id="dt"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="du">Duration (min)</Label>
              <Input
                id="du"
                type="number"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm({ ...form, status: v as BookingWithRelations["status"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses
                  .filter((s) => s !== "all")
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel[s]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="nt">Notes</Label>
            <Input
              id="nt"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : booking ? "Save changes" : "Create booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
