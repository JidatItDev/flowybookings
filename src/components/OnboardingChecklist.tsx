import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Sparkles, UserCog, Link2, X, ChevronRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

type Props = {
  hasService: boolean;
  hasStaff: boolean;
  shopSlug?: string | null;
};

export function OnboardingChecklist({ hasService, hasStaff, shopSlug }: Props) {
  const { t } = useT();
  const bookingUrl = useMemo(
    () => (shopSlug ? `${typeof window !== "undefined" ? window.location.origin : ""}/book?shop=${shopSlug}` : ""),
    [shopSlug],
  );
  const [shared, setShared] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`fb:onboarding:shared:${shopSlug ?? ""}`) === "1";
  });
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`fb:onboarding:dismissed:${shopSlug ?? ""}`) === "1";
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
      localStorage.setItem(`fb:onboarding:shared:${shopSlug ?? ""}`, "1");
      setShared(true);
      toast.success(t("checklist.linkCopied"));
    } catch {
      toast.error(t("checklist.copyFailed"));
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(`fb:onboarding:dismissed:${shopSlug ?? ""}`, "1");
    setDismissed(true);
  };

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
