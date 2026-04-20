// Admin subscription management for a single shop.
// Editable: plan, subscription_status, plan_expires_at, platform_fee_bps_override,
// next_billing_at, mollie_subscription_id (read-only), subscription_notes.
// Quick actions: extend trial +7/+14/+30, pause, reactivate, cancel, free month.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import { ALL_DB_PLANS, planLabel, changeShopPlan, type DbPlan } from "@/lib/plans";

type Shop = {
  id: string;
  name: string;
  plan: string;
  subscription_status: string | null;
  plan_expires_at: string | null;
  platform_fee_bps_override: number | null;
  next_billing_at: string | null;
  mollie_subscription_id: string | null;
  subscription_notes: string | null;
};

const STATUSES = ["active", "trial", "expired", "cancelled", "paused", "payment_failed"] as const;

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

async function logAction(shopId: string, action: string, actor: { id: string | null; email: string | null }, metadata: Record<string, unknown>) {
  try {
    await supabase.from("activity_log").insert({
      shop_id: shopId, entity: "shop", action,
      actor_user_id: actor.id, actor_email: actor.email,
      metadata,
    });
  } catch { /* ignore */ }
}

export function SubscriptionPanel({ shop }: { shop: Shop }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = { id: user?.id ?? null, email: user?.email ?? null };

  const [plan, setPlan] = useState<DbPlan>(shop.plan as DbPlan);
  const [status, setStatus] = useState<string>(shop.subscription_status ?? "active");
  const [expiresAt, setExpiresAt] = useState(toDateInputValue(shop.plan_expires_at));
  const [nextBilling, setNextBilling] = useState(toDateInputValue(shop.next_billing_at));
  const [feeOverride, setFeeOverride] = useState<string>(
    shop.platform_fee_bps_override == null ? "" : (shop.platform_fee_bps_override / 100).toFixed(2),
  );
  const [notes, setNotes] = useState(shop.subscription_notes ?? "");
  const [confirmAction, setConfirmAction] = useState<{ label: string; run: () => Promise<void> } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const saveCore = useMutation({
    mutationFn: async () => {
      const updates: Record<string, unknown> = {
        subscription_status: status,
        plan_expires_at: expiresAt ? new Date(expiresAt + "T23:59:59Z").toISOString() : null,
        next_billing_at: nextBilling ? new Date(nextBilling + "T00:00:00Z").toISOString() : null,
        platform_fee_bps_override: feeOverride === "" ? null : Math.round(parseFloat(feeOverride) * 100),
        subscription_notes: notes || null,
      };
      const { error } = await supabase.from("shops").update(updates).eq("id", shop.id);
      if (error) throw error;
      await logAction(shop.id, "subscription_updated", actor, updates);
      if (plan !== shop.plan) {
        await changeShopPlan({ shopId: shop.id, newPlan: plan, previousPlan: shop.plan, actorUserId: actor.id, actorEmail: actor.email, source: "admin" });
      }
    },
    onSuccess: () => { invalidate(); toast.success(`Abonnement bijgewerkt voor ${shop.name}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const extendDays = (days: number) => async () => {
    const base = expiresAt ? new Date(expiresAt + "T23:59:59Z") : new Date();
    base.setDate(base.getDate() + days);
    const iso = base.toISOString();
    const { error } = await supabase.from("shops").update({ plan_expires_at: iso }).eq("id", shop.id);
    if (error) { toast.error(error.message); return; }
    setExpiresAt(toDateInputValue(iso));
    await logAction(shop.id, days === 30 && status === "active" ? "free_month_granted" : "trial_extended", actor, { added_days: days, new_expires_at: iso });
    invalidate();
    toast.success(`+${days} dagen toegevoegd voor ${shop.name}`);
  };

  const setStatusAction = (newStatus: string, action: string) => async () => {
    const { error } = await supabase.from("shops").update({ subscription_status: newStatus }).eq("id", shop.id);
    if (error) { toast.error(error.message); return; }
    setStatus(newStatus);
    await logAction(shop.id, action, actor, { previous_status: status, new_status: newStatus });
    invalidate();
    toast.success(`Status bijgewerkt voor ${shop.name}`);
  };

  const ask = (label: string, run: () => Promise<void>) => () => setConfirmAction({ label, run });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h2 className="mb-4 text-base font-semibold">Abonnement beheer</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Plan</Label>
          <select value={plan} onChange={(e) => setPlan(e.target.value as DbPlan)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
            {ALL_DB_PLANS.map((p) => <option key={p} value={p}>{planLabel(p)}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs" htmlFor="exp">Plan/trial verloopt op</Label>
          <Input id="exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs" htmlFor="nb">Volgende betaaldatum</Label>
          <Input id="nb" type="date" value={nextBilling} onChange={(e) => setNextBilling(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs" htmlFor="fee">Platform fee % (override, leeg = standaard)</Label>
          <Input id="fee" type="number" step="0.01" min="0" max="100" value={feeOverride} onChange={(e) => setFeeOverride(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Mollie subscription ID</Label>
          <Input value={shop.mollie_subscription_id ?? ""} readOnly className="mt-1 bg-muted/30" placeholder="—" />
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-xs" htmlFor="notes">Admin notities (abonnement)</Label>
        <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Interne context, support-aantekeningen…" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => saveCore.mutate()} disabled={saveCore.isPending}>
          {saveCore.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Wijzigingen opslaan
        </Button>
        <div className="mx-1 h-8 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={ask(`+7 dagen verlengen voor ${shop.name}`, extendDays(7))}>+7 dagen</Button>
        <Button size="sm" variant="outline" onClick={ask(`+14 dagen verlengen voor ${shop.name}`, extendDays(14))}>+14 dagen</Button>
        <Button size="sm" variant="outline" onClick={ask(`+30 dagen verlengen voor ${shop.name}`, extendDays(30))}>+30 dagen (gratis maand)</Button>
        <div className="mx-1 h-8 w-px bg-border" />
        {status !== "paused" && <Button size="sm" variant="outline" onClick={ask(`Pauzeer abonnement voor ${shop.name}`, setStatusAction("paused", "subscription_paused"))}>Pauzeer</Button>}
        {status !== "active" && <Button size="sm" variant="outline" onClick={ask(`Heractiveer abonnement voor ${shop.name}`, setStatusAction("active", "subscription_reactivated"))}>Heractiveer</Button>}
        {status !== "cancelled" && <Button size="sm" variant="outline" className="text-destructive" onClick={ask(`Annuleer abonnement voor ${shop.name}`, setStatusAction("cancelled", "subscription_cancelled"))}>Annuleer</Button>}
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bevestigen</AlertDialogTitle>
            <AlertDialogDescription>Weet je zeker dat je deze actie wilt uitvoeren? — {confirmAction?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { const a = confirmAction; setConfirmAction(null); await a?.run(); }}>Doorvoeren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
