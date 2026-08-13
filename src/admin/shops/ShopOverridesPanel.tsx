// Admin: per-shop feature usage + temporary overrides.
// Lives inside an expandable row in /beheer/dashboard/shops.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Trash2, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/auth/lib/auth-context";
import { planLabel } from "@/shared/lib/plans";
import { formatDate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";

type FeatureAccessRow = {
  allowed: boolean;
  limit_value: number | null;
  used: number;
  upgrade_plan: string | null;
  current_plan: string;
};

type Override = {
  id: string;
  shop_id: string;
  feature_slug: string;
  is_included: boolean;
  limit_value: number | null;
  expires_at: string | null;
  reason: string | null;
  granted_by_email: string | null;
  created_at: string;
};

const TRACKED_FEATURES: { slug: string; label: string; unit?: string }[] = [
  { slug: "max_bookings_per_month", label: "Boekingen", unit: "boekingen" },
  { slug: "sms_reminders", label: "SMS", unit: "berichten" },
  { slug: "whatsapp_reminders", label: "WhatsApp", unit: "berichten" },
  { slug: "max_staff", label: "Medewerkers", unit: "actief" },
  { slug: "marketing_emails", label: "Marketing-e-mails", unit: "verzonden" },
];

const OVERRIDABLE_FEATURES = [
  { slug: "sms_reminders", label: "SMS herinneringen", limitable: true },
  { slug: "whatsapp_reminders", label: "WhatsApp herinneringen", limitable: true },
  { slug: "marketing_emails", label: "Marketing e-mails", limitable: true },
  { slug: "advanced_analytics", label: "Geavanceerde statistieken" },
  { slug: "custom_branding", label: "Eigen branding" },
  { slug: "google_reviews", label: "Google Reviews" },
  { slug: "waitlist", label: "Wachtlijst" },
  { slug: "multi_location", label: "Multi-locatie" },
  { slug: "white_label", label: "White-label" },
  { slug: "api_access", label: "API access" },
  { slug: "priority_support", label: "Priority support" },
  { slug: "max_bookings_per_month", label: "Max boekingen / maand", limitable: true, isLimitOnly: true },
  { slug: "max_staff", label: "Max medewerkers", limitable: true, isLimitOnly: true },
];

export function ShopOverridesPanel({ shopId, shopName, plan }: { shopId: string; shopName: string; plan: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Fetch all feature accesses in parallel
  const accessQueries = useQuery({
    queryKey: ["admin", "shop-feature-usage", shopId],
    queryFn: async () => {
      const results: Record<string, FeatureAccessRow> = {};
      await Promise.all(
        TRACKED_FEATURES.map(async (f) => {
          const { data, error } = await supabase.rpc("get_shop_feature_access", {
            _shop_id: shopId,
            _feature_slug: f.slug,
          });
          if (error) return;
          const row = Array.isArray(data) ? data[0] : data;
          if (row) results[f.slug] = row as FeatureAccessRow;
        }),
      );
      return results;
    },
  });

  const overridesQuery = useQuery({
    queryKey: ["admin", "shop-overrides", shopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_feature_overrides")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Override[];
    },
  });

  const removeOverride = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shop_feature_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override ingetrokken");
      qc.invalidateQueries({ queryKey: ["admin", "shop-overrides", shopId] });
      qc.invalidateQueries({ queryKey: ["admin", "shop-feature-usage", shopId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Plan & feature-overrides — {shopName}
        <span className="rounded-full bg-card px-2 py-0.5 text-xs font-normal text-muted-foreground">
          Huidig plan: {planLabel(plan)}
        </span>
      </div>

      {/* Usage */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gebruik deze maand</p>
        {accessQueries.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Laden…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {TRACKED_FEATURES.map((f) => {
              const row = accessQueries.data?.[f.slug];
              const used = row?.used ?? 0;
              const limit = row?.limit_value;
              const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              const over = limit !== null && limit !== undefined && used >= limit;
              return (
                <div key={f.slug} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", over && "text-destructive")}>
                    {used}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}/ {limit ?? "∞"}
                    </span>
                  </p>
                  {limit && limit > 0 && (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full transition-all", over ? "bg-destructive" : pct > 80 ? "bg-warning" : "bg-primary")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active overrides */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actieve overrides</p>
        {overridesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Laden…
          </div>
        ) : overridesQuery.data && overridesQuery.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {overridesQuery.data.map((o) => {
              const expired = o.expires_at && new Date(o.expires_at) <= new Date();
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div>
                    <p className="font-medium">
                      {o.feature_slug}{" "}
                      <span className="text-muted-foreground">
                        — {o.is_included ? "ingeschakeld" : "uitgeschakeld"}
                        {o.limit_value !== null ? `, limiet ${o.limit_value}` : ""}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      {expired ? <span className="text-destructive">Verlopen</span> : o.expires_at ? `Vervalt ${formatDate(o.expires_at)}` : "Permanent"}
                      {o.reason ? ` · ${o.reason}` : ""}
                      {o.granted_by_email ? ` · door ${o.granted_by_email}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOverride.mutate(o.id)}
                    disabled={removeOverride.isPending}
                    aria-label="Verwijder override"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nog geen overrides.</p>
        )}
      </div>

      {/* Add override */}
      <AddOverrideForm
        shopId={shopId}
        actorEmail={user?.email ?? null}
        actorId={user?.id ?? null}
        onAdded={() => {
          qc.invalidateQueries({ queryKey: ["admin", "shop-overrides", shopId] });
          qc.invalidateQueries({ queryKey: ["admin", "shop-feature-usage", shopId] });
        }}
      />

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" />
        Overrides hebben voorrang op het standaard plan. Gebruik dit voor compensatie of incidentele verzoeken; permanente upgrades doe je via plan-wijziging.
      </p>
    </div>
  );
}

function AddOverrideForm({
  shopId, actorEmail, actorId, onAdded,
}: { shopId: string; actorEmail: string | null; actorId: string | null; onAdded: () => void }) {
  const [slug, setSlug] = useState<string>(OVERRIDABLE_FEATURES[0].slug);
  const [included, setIncluded] = useState(true);
  const [limit, setLimit] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>(""); // yyyy-mm-dd
  const [reason, setReason] = useState("");

  const featureMeta = OVERRIDABLE_FEATURES.find((f) => f.slug === slug);

  const addMutation = useMutation({
    mutationFn: async () => {
      const expires_at = expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : null;
      const limit_value = limit === "" ? null : Math.max(0, Math.round(Number(limit)));
      const { error } = await supabase
        .from("shop_feature_overrides")
        .upsert(
          {
            shop_id: shopId,
            feature_slug: slug,
            is_included: featureMeta?.isLimitOnly ? true : included,
            limit_value,
            expires_at,
            reason: reason || null,
            granted_by: actorId,
            granted_by_email: actorEmail,
          },
          { onConflict: "shop_id,feature_slug" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override toegevoegd");
      setLimit(""); setReason(""); setExpiresAt("");
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Override toevoegen</p>
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <Label className="text-xs">Functie</Label>
          <Select value={slug} onValueChange={setSlug}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OVERRIDABLE_FEATURES.map((f) => (
                <SelectItem key={f.slug} value={f.slug}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!featureMeta?.isLimitOnly && (
          <div className="flex items-end gap-2">
            <Switch checked={included} onCheckedChange={setIncluded} id={`inc-${slug}`} />
            <Label htmlFor={`inc-${slug}`} className="text-xs">Ingeschakeld</Label>
          </div>
        )}
        {featureMeta?.limitable && (
          <div>
            <Label className="text-xs">Limiet (leeg = ∞)</Label>
            <Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} className="h-9" />
          </div>
        )}
        <div>
          <Label className="text-xs">Vervalt op</Label>
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="h-9" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Reden (intern)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="bv. compensatie storing" className="h-9" />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="hero" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
          {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Toevoegen
        </Button>
      </div>
    </div>
  );
}
