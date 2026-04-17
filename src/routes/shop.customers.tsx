import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Mail, Phone, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { customersQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, initials, relativeFromNow } from "@/lib/format";

export const Route = createFileRoute("/shop/customers")({
  head: () => ({ meta: [{ title: "Customers — Bookly" }] }),
  component: CustomersPage,
});

type CustomerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  total_spent_cents: number;
  last_visit_at: string | null;
};

function CustomersPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);

  const { data: customers = [], isLoading } = useQuery({
    ...customersQuery(shopId ?? ""),
    enabled: !!shopId,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer deleted");
      setDeleting(null);
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.customers(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = customers.filter((c) => {
    const needle = q.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(needle) ||
      (c.email ?? "").toLowerCase().includes(needle) ||
      (c.phone ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <ShopLayout>
      <PageHeader
        title="Customers"
        description="Profiles, history and lifetime value."
        actions={
          <Button variant="hero" onClick={() => setCreating(true)} disabled={!shopId}>
            <Plus className="h-4 w-4" /> New customer
          </Button>
        }
      />

      {!shopId ? (
        <NoShopState />
      ) : (
        <>
          <div className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 shadow-xs">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search customers…"
              className="h-10 flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {isLoading ? (
            <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
          ) : list.length === 0 ? (
            <EmptyState
              icon={Users}
              title={q ? "No matches" : "No customers yet"}
              description={
                q
                  ? "Try a different search term."
                  : "Add your first customer or let them book online."
              }
              action={
                !q && (
                  <Button variant="hero" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" /> Add customer
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-left">Customer</th>
                    <th className="hidden px-6 py-3 text-left md:table-cell">Contact</th>
                    <th className="hidden px-6 py-3 text-left sm:table-cell">Total spent</th>
                    <th className="hidden px-6 py-3 text-left lg:table-cell">Last visit</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-warm text-xs font-semibold text-pink-foreground">
                            {initials(c.full_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.full_name}</p>
                            {c.notes && (
                              <p className="truncate text-xs text-muted-foreground">
                                {c.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-6 py-4 text-xs text-muted-foreground md:table-cell">
                        {c.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5" />
                            {c.email}
                          </div>
                        )}
                        {c.phone && (
                          <div className="mt-1 flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5" />
                            {c.phone}
                          </div>
                        )}
                      </td>
                      <td className="hidden px-6 py-4 sm:table-cell">
                        {formatCents(c.total_spent_cents)}
                      </td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">
                        {relativeFromNow(c.last_visit_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(c)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <CustomerFormDialog
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        customer={editing}
        shopId={shopId}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their booking history will be kept but no longer linked to a customer profile.
            </AlertDialogDescription>
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

function CustomerFormDialog({
  open,
  onClose,
  customer,
  shopId,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerRow | null;
  shopId: string | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [lastId, setLastId] = useState<string | null>(null);
  if (open && customer?.id !== lastId) {
    setLastId(customer?.id ?? null);
    setForm({
      full_name: customer?.full_name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      notes: customer?.notes ?? "",
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
        notes: form.notes.trim() || null,
      };
      if (customer) {
        const { error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", customer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(customer ? "Customer updated" : "Customer added");
      onClose();
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.customers(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
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
            <Label htmlFor="nt">Notes</Label>
            <Textarea
              id="nt"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
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
            {save.isPending ? "Saving…" : customer ? "Save changes" : "Add customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
