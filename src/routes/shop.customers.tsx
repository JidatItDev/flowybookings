import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Mail, Phone, Pencil, Trash2, Users, AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import { customersQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, initials, relativeFromNow } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop/customers")({
  head: () => ({ meta: [{ title: "Customers — FlowyBookings" }] }),
  component: CustomersPage,
});

type CustomerRow = { id: string; full_name: string; email: string | null; phone: string | null; notes: string | null; total_spent_cents: number; last_visit_at: string | null; no_show_count?: number; requires_deposit?: boolean; tags?: string[] | null };

function CustomersPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);

  const { data: customers = [], isLoading } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("customers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success(t("customers.deleted")); setDeleting(null); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.customers(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = customers.filter((c) => { const needle = q.toLowerCase(); return c.full_name.toLowerCase().includes(needle) || (c.email ?? "").toLowerCase().includes(needle) || (c.phone ?? "").toLowerCase().includes(needle); });

  return (
    <ShopLayout>
      <PageHeader title={t("customers.title")} description={t("customers.description")} actions={<Button variant="hero" onClick={() => setCreating(true)} disabled={!shopId}><Plus className="h-4 w-4" /> {t("customers.newCustomer")}</Button>} />
      {!shopId ? <NoShopState /> : (
        <>
          <div className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 shadow-xs">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("customers.searchPlaceholder")} className="h-10 flex-1 bg-transparent text-sm outline-none" />
          </div>
          {isLoading ? <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" /> : list.length === 0 ? (
            <EmptyState icon={Users} title={q ? t("customers.noMatches") : t("customers.noCustomers")} description={q ? t("customers.noMatchDesc") : t("customers.noCustomersDesc")} action={!q && <Button variant="hero" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> {t("customers.addCustomer")}</Button>} />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-left">{t("customers.customerCol")}</th>
                    <th className="hidden px-6 py-3 text-left md:table-cell">{t("customers.contact")}</th>
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
                    return (
                    <tr
                      key={c.id}
                      onClick={() => navigate({ to: "/shop/customers/$customerId", params: { customerId: c.id } })}
                      className={cn("cursor-pointer hover:bg-muted/30", repeat && "bg-destructive/5")}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-warm text-xs font-semibold text-pink-foreground">{initials(c.full_name)}</div>
                          <div className="min-w-0">
                            <p className="truncate font-medium flex items-center gap-2 flex-wrap">
                              {c.full_name}
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
                            {c.notes && <p className="truncate text-xs text-muted-foreground">{c.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-6 py-4 text-xs text-muted-foreground md:table-cell">{c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{c.email}</div>}{c.phone && <div className="mt-1 flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{c.phone}</div>}</td>
                      <td className="hidden px-6 py-4 sm:table-cell">{formatCents(c.total_spent_cents)}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{relativeFromNow(c.last_visit_at)}</td>
                      <td className="hidden px-6 py-4 sm:table-cell">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", ns === 0 ? "bg-mint/40 text-mint-foreground" : ns === 1 ? "bg-amber-500/15 text-amber-700" : "bg-destructive/15 text-destructive")}>
                          {ns > 0 && <AlertTriangle className="h-3 w-3" />} {ns}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="icon" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setDeleting(c)}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <CustomerFormDialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} customer={editing} shopId={shopId} />
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
      if (!shopId) throw new Error("No active shop");
      const payload = { shop_id: shopId, full_name: form.full_name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, notes: form.notes.trim() || null, requires_deposit: form.requires_deposit };
      if (customer) { const { error } = await supabase.from("customers").update(payload).eq("id", customer.id); if (error) throw error; }
      else { const { error } = await supabase.from("customers").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(customer ? t("customers.updated") : t("customers.added")); onClose(); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.customers(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ns = customer?.no_show_count ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{customer ? t("customers.editCustomer") : t("customers.newCustomerTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          {customer && (
            <div className={cn("rounded-lg border px-3 py-2 text-xs flex items-center justify-between", ns >= 2 ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-muted-foreground")}>
              <span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> {t("customers.noShowsLabel")}</span>
              <span className="font-semibold">{ns}</span>
            </div>
          )}
          <div><Label htmlFor="fn">{t("customers.fullName")}</Label><Input id="fn" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label htmlFor="em">{t("customers.email")}</Label><Input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label htmlFor="ph">{t("customers.phone")}</Label><Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label htmlFor="nt">{t("customers.notes")}</Label><Textarea id="nt" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={form.requires_deposit} onChange={(e) => setForm({ ...form, requires_deposit: e.target.checked })} />
            <span>
              <span className="font-medium">{t("customers.requireDeposit")}</span>
              <span className="block text-xs text-muted-foreground">{t("customers.requireDepositHint")}</span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("customers.cancel")}</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={!form.full_name.trim() || save.isPending}>{save.isPending ? t("customers.saving") : customer ? t("customers.saveChanges") : t("customers.addCustomer")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
