import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarRange, Pencil, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { EmptyState, LoadingGrid, NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import { staffQuery, servicesQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/staff")({
  head: () => ({ meta: [{ title: "Staff — Bookly" }] }),
  component: StaffPage,
});

type StaffRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  working_hours: { hours?: string } | Record<string, unknown>;
};

function StaffPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<StaffRow | null>(null);

  const { data: staff = [], isLoading } = useQuery({
    ...(shopId ? staffQuery(shopId) : { queryKey: ["noop"], queryFn: async () => [] }),
    enabled: !!shopId,
  });

  const { data: services = [] } = useQuery({
    ...(shopId ? servicesQuery(shopId) : { queryKey: ["noop"], queryFn: async () => [] }),
    enabled: !!shopId,
  });

  const { data: links = [] } = useQuery({
    queryKey: ["staff_services", shopId],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_services").select("*");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!shopId,
  });

  const toggleActive = useMutation({
    mutationFn: async (s: StaffRow) => {
      const { error } = await supabase
        .from("staff")
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff member removed");
      setDeleting(null);
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const serviceNamesFor = (staffId: string) => {
    const ids = new Set(links.filter((l) => l.staff_id === staffId).map((l) => l.service_id));
    return services.filter((s) => ids.has(s.id)).map((s) => s.name);
  };

  return (
    <ShopLayout>
      <PageHeader
        title="Staff"
        description="Manage team members, services and working hours."
        actions={
          <Button variant="hero" onClick={() => setCreating(true)} disabled={!shopId}>
            <Plus className="h-4 w-4" /> Add staff
          </Button>
        }
      />

      {!shopId ? (
        <NoShopState />
      ) : isLoading ? (
        <LoadingGrid count={4} />
      ) : staff.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No staff yet"
          description="Add team members so customers can book with them."
          action={
            <Button variant="hero" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Add staff
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {staff.map((m) => {
            const hrs = (m.working_hours as { hours?: string })?.hours ?? "Not set";
            const svcs = serviceNamesFor(m.id);
            return (
              <div
                key={m.id}
                className="rounded-2xl border border-border bg-card p-6 shadow-soft"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-base font-semibold text-primary-foreground">
                    {initials(m.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{m.full_name}</h3>
                      <button
                        onClick={() => toggleActive.mutate(m)}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase transition",
                          m.is_active
                            ? "bg-mint text-mint-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {m.is_active ? "Active" : "Off"}
                      </button>
                    </div>
                    {m.email && (
                      <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                    )}
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarRange className="h-3.5 w-3.5" /> {hrs}
                    </p>
                  </div>
                </div>
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Services ({svcs.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {svcs.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No services assigned
                      </span>
                    ) : (
                      svcs.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                        >
                          {s}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(m)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StaffFormDialog
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        member={editing}
        shopId={shopId}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be assignable to new bookings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && remove.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShopLayout>
  );
}

function StaffFormDialog({
  open,
  onClose,
  member,
  shopId,
}: {
  open: boolean;
  onClose: () => void;
  member: StaffRow | null;
  shopId: string | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    hours: "",
    is_active: true,
  });
  const [lastId, setLastId] = useState<string | null>(null);
  if (open && member?.id !== lastId) {
    setLastId(member?.id ?? null);
    setForm({
      full_name: member?.full_name ?? "",
      email: member?.email ?? "",
      phone: member?.phone ?? "",
      hours: (member?.working_hours as { hours?: string })?.hours ?? "",
      is_active: member?.is_active ?? true,
    });
  }
  if (!open && lastId !== null) setLastId(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No active shop");
      const payload = {
        shop_id: shopId,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        is_active: form.is_active,
        working_hours: form.hours.trim() ? { hours: form.hours.trim() } : {},
      };
      if (member) {
        const { error } = await supabase.from("staff").update(payload).eq("id", member.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(member ? "Staff updated" : "Staff added");
      onClose();
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? "Edit staff" : "Add staff"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label htmlFor="fn">Full name</Label>
            <Input
              id="fn"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="em">Email</Label>
            <Input
              id="em"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="ph">Phone</Label>
            <Input
              id="ph"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="hr">Working hours</Label>
            <Input
              id="hr"
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: e.target.value })}
              placeholder="e.g. Mon–Fri · 9–18"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Available for bookings</p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="hero"
            onClick={() => save.mutate()}
            disabled={!form.full_name.trim() || save.isPending}
          >
            {save.isPending ? "Saving…" : member ? "Save changes" : "Add staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
