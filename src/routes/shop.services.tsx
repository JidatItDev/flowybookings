import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, LoadingGrid, NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import { servicesQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop/services")({ head: () => ({ meta: [{ title: "Services — FlowyBookings" }] }), component: ServicesPage });

const categoryColors: Record<string, string> = { Hair: "bg-primary-soft text-primary", Nails: "bg-pink text-pink-foreground", Beauty: "bg-peach text-peach-foreground", Tattoo: "bg-info/15 text-info-foreground", Pet: "bg-mint text-mint-foreground" };
type ServiceRow = { id: string; name: string; description: string | null; category: string | null; duration_minutes: number; price_cents: number; deposit_cents: number; is_active: boolean; currency: string };

function ServicesPage() {
  const shopId = useActiveShopId(); const qc = useQueryClient(); const { t } = useT();
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ServiceRow | null>(null);
  const { data: services = [], isLoading } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });

  const toggleActive = useMutation({
    mutationFn: async (s: ServiceRow) => { const { error } = await supabase.from("services").update({ is_active: !s.is_active }).eq("id", s.id); if (error) throw error; },
    onSuccess: () => { if (shopId) qc.invalidateQueries({ queryKey: shopKeys.services(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("services").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success(t("services.deleted")); setDeleting(null); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.services(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ShopLayout>
      <PageHeader title={t("services.title")} description={t("services.description")} actions={<Button variant="hero" onClick={() => setCreating(true)} disabled={!shopId}><Plus className="h-4 w-4" /> {t("services.addService")}</Button>} />
      {!shopId ? <NoShopState /> : isLoading ? <LoadingGrid /> : services.length === 0 ? (
        <EmptyState icon={Sparkles} title={t("services.noServices")} description={t("services.noServicesDesc")} action={<Button variant="hero" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> {t("services.addService")}</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {s.category && <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", categoryColors[s.category] ?? "bg-muted text-muted-foreground")}>{s.category}</span>}
                  <h3 className="mt-2 truncate text-base font-semibold">{s.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("services.min", { n: s.duration_minutes })}</p>
                </div>
                <button onClick={() => toggleActive.mutate(s)} className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium transition", s.is_active ? "bg-mint text-mint-foreground" : "bg-muted text-muted-foreground")}>{s.is_active ? t("services.active") : t("services.inactive")}</button>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-semibold tracking-tight">{formatCents(s.price_cents, s.currency)}</p>
                  {s.deposit_cents > 0 && <p className="text-xs text-muted-foreground">{t("services.deposit", { amount: formatCents(s.deposit_cents, s.currency) })}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ServiceFormDialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} service={editing} shopId={shopId} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("services.deleteService")}</AlertDialogTitle><AlertDialogDescription>{t("services.deleteDesc", { name: deleting?.name ?? "" })}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("services.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("services.delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShopLayout>
  );
}

function ServiceFormDialog({ open, onClose, service, shopId }: { open: boolean; onClose: () => void; service: ServiceRow | null; shopId: string | null }) {
  const qc = useQueryClient(); const { t } = useT();
  const [form, setForm] = useState({ name: "", category: "", duration_minutes: 30, price: 0, deposit: 0, is_active: true, description: "" });
  useEffect(() => {
    if (!open) return;
    const s = service;
    setForm({ name: s?.name ?? "", category: s?.category ?? "", duration_minutes: s?.duration_minutes ?? 30, price: s ? s.price_cents / 100 : 0, deposit: s ? s.deposit_cents / 100 : 0, is_active: s?.is_active ?? true, description: s?.description ?? "" });
  }, [open, service?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No active shop");
      const payload = { shop_id: shopId, name: form.name.trim(), category: form.category.trim() || null, description: form.description.trim() || null, duration_minutes: Number(form.duration_minutes) || 30, price_cents: Math.round(Number(form.price) * 100), deposit_cents: Math.round(Number(form.deposit) * 100), is_active: form.is_active };
      if (service) { const { error } = await supabase.from("services").update(payload).eq("id", service.id); if (error) throw error; }
      else { const { error } = await supabase.from("services").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(service ? t("services.updated") : t("services.created")); onClose(); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.services(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{service ? t("services.editService") : t("services.newService")}</DialogTitle><DialogDescription>{t("services.setDetails")}</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div><Label htmlFor="name">{t("services.name")}</Label><Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="cat">{t("services.category")}</Label><Input id="cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label htmlFor="dur">{t("services.durationMin")}</Label><Input id="dur" type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="price">{t("services.priceEur")}</Label><Input id="price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            <div><Label htmlFor="dep">{t("services.depositEur")}</Label><Input id="dep" type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: Number(e.target.value) })} /></div>
          </div>
          <div><Label htmlFor="desc">{t("services.descriptionLabel")}</Label><Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3"><div><p className="text-sm font-medium">{t("services.activeLabel")}</p><p className="text-xs text-muted-foreground">{t("services.bookable")}</p></div><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("services.cancel")}</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>{save.isPending ? t("services.saving") : service ? t("services.saveChanges") : t("services.createService")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
