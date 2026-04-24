// Admin: edit plan pricing, fees, limits, and feature toggles per plan.
// Reads from plan_pricing + plan_features. Writes are gated by RLS (super_admin only).
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ALL_DB_PLANS, planLabel, type DbPlan } from "@/lib/plans";

type Pricing = { plan_name: DbPlan; monthly_price_cents: number; platform_fee_bps: number; booking_fee_cents: number };
type FeatureRow = { plan_name: DbPlan; feature_slug: string; is_included: boolean; limit_value: number | null };

// Feature display config — order + nice labels
const FEATURE_GROUPS: { title: string; features: { slug: string; label: string; hasLimit?: boolean; isLimitOnly?: boolean }[] }[] = [
  {
    title: "Limieten",
    features: [
      { slug: "max_staff", label: "Max medewerkers", hasLimit: true, isLimitOnly: true },
      { slug: "max_bookings_per_month", label: "Max boekingen / maand", hasLimit: true, isLimitOnly: true },
    ],
  },
  {
    title: "Communicatie",
    features: [
      { slug: "email_reminders", label: "E-mail herinneringen" },
      { slug: "sms_reminders", label: "SMS herinneringen", hasLimit: true },
      { slug: "whatsapp_reminders", label: "WhatsApp herinneringen", hasLimit: true },
      { slug: "marketing_emails", label: "Marketing e-mails", hasLimit: true },
    ],
  },
  {
    title: "Geavanceerd",
    features: [
      { slug: "advanced_analytics", label: "Geavanceerde statistieken" },
      { slug: "custom_branding", label: "Eigen branding" },
      { slug: "google_reviews", label: "Google Reviews" },
      { slug: "waitlist", label: "Wachtlijst" },
    ],
  },
  {
    title: "Enterprise",
    features: [
      { slug: "multi_location", label: "Multi-locatie" },
      { slug: "white_label", label: "White-label" },
      { slug: "api_access", label: "API access" },
      { slug: "priority_support", label: "Priority support" },
    ],
  },
];

const planKey = (plan: DbPlan, slug: string) => `${plan}::${slug}`;

export function PlanConfigurationCard() {
  const qc = useQueryClient();

  const { data: pricing = [], isLoading: pricingLoading } = useQuery({
    queryKey: ["admin", "plan_pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_pricing")
        .select("plan_name, monthly_price_cents, platform_fee_bps, booking_fee_cents");
      if (error) throw error;
      return data as Pricing[];
    },
  });

  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ["admin", "plan_features"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_features").select("plan_name, feature_slug, is_included, limit_value");
      if (error) throw error;
      return data as FeatureRow[];
    },
  });

  // Local edit state
  const [pricingDraft, setPricingDraft] = useState<Record<DbPlan, Pricing>>({} as Record<DbPlan, Pricing>);
  const [featureDraft, setFeatureDraft] = useState<Record<string, FeatureRow>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (pricing.length > 0) {
      const map = {} as Record<DbPlan, Pricing>;
      for (const p of pricing) map[p.plan_name] = p;
      setPricingDraft(map);
    }
  }, [pricing]);

  useEffect(() => {
    if (features.length > 0) {
      const map: Record<string, FeatureRow> = {};
      for (const f of features) map[planKey(f.plan_name, f.feature_slug)] = f;
      setFeatureDraft(map);
    }
  }, [features]);

  const setPricing = (plan: DbPlan, patch: Partial<Pricing>) => {
    setPricingDraft((prev) => ({ ...prev, [plan]: { ...prev[plan], ...patch, plan_name: plan } }));
    setDirty(true);
  };
  const setFeature = (plan: DbPlan, slug: string, patch: Partial<FeatureRow>) => {
    const k = planKey(plan, slug);
    setFeatureDraft((prev) => {
      const existing = prev[k] ?? { plan_name: plan, feature_slug: slug, is_included: false, limit_value: null };
      return { ...prev, [k]: { ...existing, ...patch } };
    });
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Pricing upserts
      const pricingRows = Object.values(pricingDraft).map((p) => ({
        plan_name: p.plan_name,
        monthly_price_cents: Math.max(0, Math.round(p.monthly_price_cents || 0)),
        platform_fee_bps: Math.max(0, Math.round(p.platform_fee_bps || 0)),
      }));
      const { error: pricingErr } = await supabase
        .from("plan_pricing")
        .upsert(pricingRows, { onConflict: "plan_name" });
      if (pricingErr) throw pricingErr;

      // Feature upserts
      const featureRows = Object.values(featureDraft).map((f) => ({
        plan_name: f.plan_name,
        feature_slug: f.feature_slug,
        is_included: !!f.is_included,
        limit_value: f.limit_value === null || f.limit_value === undefined || (f.limit_value as unknown as string) === ""
          ? null
          : Math.max(0, Math.round(Number(f.limit_value))),
      }));
      const { error: featuresErr } = await supabase
        .from("plan_features")
        .upsert(featureRows, { onConflict: "plan_name,feature_slug" });
      if (featuresErr) throw featuresErr;
    },
    onSuccess: () => {
      toast.success("Plan-configuratie opgeslagen");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "plan_pricing"] });
      qc.invalidateQueries({ queryKey: ["admin", "plan_features"] });
      qc.invalidateQueries({ queryKey: ["feature-access"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isLoading = pricingLoading || featuresLoading;
  const allPlans = useMemo(() => ALL_DB_PLANS, []);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Plan-configuratie laden…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">Plan configuratie</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Beheer prijzen, platform-fee, limieten en feature-toggles per abonnement.
          </p>
        </div>
        <Button variant="hero" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Opslaan
        </Button>
      </div>

      <div className="flex items-start gap-2 border-b border-border bg-warning/10 px-6 py-3 text-xs text-foreground/80">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warning-foreground" />
        <span>
          Wijzigingen gelden direct voor alle shops. Bestaande abonnementen behouden hun huidige prijs tot de eerstvolgende verlenging.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Prijs / maand (EUR)</th>
              <th className="px-4 py-3 text-left">Platform fee (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allPlans.map((plan) => {
              const p = pricingDraft[plan] ?? { plan_name: plan, monthly_price_cents: 0, platform_fee_bps: 0 };
              return (
                <tr key={plan}>
                  <td className="px-4 py-3 font-medium">{planLabel(plan)}</td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={(p.monthly_price_cents / 100).toString()}
                      onChange={(e) => setPricing(plan, { monthly_price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                      className="h-9 w-32"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={(p.platform_fee_bps / 100).toString()}
                      onChange={(e) => setPricing(plan, { platform_fee_bps: Math.round(parseFloat(e.target.value || "0") * 100) })}
                      className="h-9 w-32"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {FEATURE_GROUPS.map((group) => (
        <div key={group.title} className="border-t border-border">
          <h3 className="px-6 pt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{group.title}</h3>
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 text-left">Functie</th>
                  {allPlans.map((plan) => (
                    <th key={plan} className="px-2 py-2 text-center font-semibold">
                      {planLabel(plan)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {group.features.map((f) => (
                  <tr key={f.slug}>
                    <td className="px-2 py-3 font-medium">{f.label}</td>
                    {allPlans.map((plan) => {
                      const row = featureDraft[planKey(plan, f.slug)] ?? {
                        plan_name: plan, feature_slug: f.slug, is_included: false, limit_value: null,
                      };
                      return (
                        <td key={plan} className={cn("px-2 py-3 text-center", plan === "pro" && "bg-primary/5")}>
                          <div className="flex flex-col items-center gap-1.5">
                            {!f.isLimitOnly && (
                              <Switch
                                checked={row.is_included}
                                onCheckedChange={(v) => setFeature(plan, f.slug, { is_included: v })}
                                aria-label={`${f.label} voor ${plan}`}
                              />
                            )}
                            {f.hasLimit && (
                              <Input
                                type="number"
                                min={0}
                                placeholder="∞"
                                value={row.limit_value ?? ""}
                                disabled={!f.isLimitOnly && !row.is_included}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setFeature(plan, f.slug, {
                                    limit_value: v === "" ? null : Math.max(0, Math.round(Number(v))),
                                    // When a limit is set on a non-limit-only feature, ensure included
                                    ...(f.isLimitOnly ? { is_included: true } : {}),
                                  });
                                }}
                                className="h-8 w-20 text-center text-xs"
                              />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-6 py-3">
        <Label className="text-xs text-muted-foreground">
          Leeg limit-veld = onbeperkt. Toggle uit = niet inbegrepen.
        </Label>
        <Button variant="hero" size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Opslaan
        </Button>
      </div>
    </div>
  );
}
