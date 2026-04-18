import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles, UserCog, Link2, X, ChevronRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { shopFullQuery, shopKeys } from "@/lib/queries";

type Props = {
  shopId: string;
  hasService: boolean;
  hasStaff: boolean;
  shopSlug?: string | null;
};

type OnboardingState = { shared?: boolean; dismissed?: boolean };

export function OnboardingChecklist({ shopId, hasService, hasStaff, shopSlug }: Props) {
  const { t } = useT();
  const qc = useQueryClient();

  const { data: shop } = useQuery({ ...shopFullQuery(shopId), enabled: !!shopId });
  const onboarding = ((shop?.onboarding ?? {}) as OnboardingState) || {};
  const shared = !!onboarding.shared;
  const dismissed = !!onboarding.dismissed;

  const bookingUrl = useMemo(
    () => (shopSlug && typeof window !== "undefined" ? `${window.location.origin}/book?shop=${shopSlug}` : ""),
    [shopSlug],
  );

  const updateOnboarding = useMutation({
    mutationFn: async (patch: OnboardingState) => {
      const next = { ...(shop?.onboarding as OnboardingState ?? {}), ...patch };
      const { error } = await supabase.from("shops").update({ onboarding: next }).eq("id", shopId);
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = [
    {
      key: "service",
      done: hasService,
      title: t("checklist.serviceTitle"),
      desc: t("checklist.serviceDesc"),
      cta: t("checklist.serviceCta"),
      to: "/shop/services",
      icon: Sparkles,
    },
    {
      key: "staff",
      done: hasStaff,
      title: t("checklist.staffTitle"),
      desc: t("checklist.staffDesc"),
      cta: t("checklist.staffCta"),
      to: "/shop/staff",
      icon: UserCog,
    },
    {
      key: "share",
      done: shared,
      title: t("checklist.shareTitle"),
      desc: t("checklist.shareDesc"),
      cta: t("checklist.shareCta"),
      to: null,
      icon: Link2,
    },
  ] as const;

  const completed = items.filter((i) => i.done).length;
  const allDone = completed === items.length;

  if (dismissed || allDone) return null;

  const handleCopy = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      updateOnboarding.mutate({ shared: true });
      toast.success(t("checklist.linkCopied"));
    } catch {
      toast.error(t("checklist.copyFailed"));
    }
  };

  const handleDismiss = () => updateOnboarding.mutate({ dismissed: true });

  const pct = Math.round((completed / items.length) * 100);

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-primary/5 shadow-soft">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {t("checklist.badge")}
            </span>
            <h2 className="truncate text-base font-semibold">{t("checklist.title")}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("checklist.progress", { done: String(completed), total: String(items.length) })}
          </p>
          <div className="mt-3 max-w-xs">
            <Progress value={pct} className="h-1.5" />
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("checklist.dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="divide-y divide-border/60">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <span
                className={
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border " +
                  (item.done
                    ? "border-mint bg-mint text-mint-foreground"
                    : "border-border bg-background text-muted-foreground")
                }
              >
                {item.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={"truncate text-sm font-medium " + (item.done ? "text-muted-foreground line-through" : "")}>
                  {item.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">{item.desc}</p>
              </div>
              {!item.done && (
                item.key === "share" ? (
                  <Button size="sm" variant="outline" onClick={handleCopy} disabled={!bookingUrl}>
                    <Copy className="h-3.5 w-3.5" /> {item.cta}
                  </Button>
                ) : item.to ? (
                  <Link to={item.to}>
                    <Button size="sm" variant="outline">
                      {item.cta} <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                ) : null
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
