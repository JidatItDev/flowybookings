// SMS credit top-up dialog — lets a shop owner buy a pack via Mollie one-off payment.
// On checkout success, redirects to Mollie. On return (?topup=return|mock) the parent
// page invalidates the SMS credits query so the new balance shows up.

import { useState } from "react";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SMS_PACKAGES, type SmsPackageId } from "@/lib/sms-packages";
import { formatCents } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  shopId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SmsTopUpDialog({ shopId, open, onOpenChange }: Props) {
  const { t } = useT();
  const [pendingId, setPendingId] = useState<SmsPackageId | null>(null);

  const startCheckout = async (pkgId: SmsPackageId) => {
    setPendingId(pkgId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("unauthenticated");

      const res = await fetch("/api/sms-credits/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          shop_id: shopId,
          package: pkgId,
          redirect_origin: window.location.origin,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; checkout_url?: string; error?: string }
        | null;
      if (!res.ok || !json?.ok || !json.checkout_url) {
        throw new Error(json?.error ?? "checkout_failed");
      }
      window.location.href = json.checkout_url;
    } catch (err) {
      console.error("[sms-topup] error", err);
      toast.error(t("smsTopup.errorGeneric"));
      setPendingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("smsTopup.title")}
          </DialogTitle>
          <DialogDescription>{t("smsTopup.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          {SMS_PACKAGES.map((p) => {
            const isPending = pendingId === p.id;
            const perCredit = p.amountCents / p.credits;
            const featured = p.id === "medium";
            return (
              <div
                key={p.id}
                className={cn(
                  "relative rounded-2xl border bg-card p-4 shadow-soft",
                  featured ? "border-primary ring-1 ring-primary/40" : "border-border",
                )}
              >
                {p.badgeKey && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    {t(p.badgeKey)}
                  </span>
                )}
                <div className="flex items-center gap-2 text-primary">
                  <Zap className="h-4 w-4" />
                  <span className="text-2xl font-bold">{p.credits}</span>
                  <span className="text-xs font-medium text-muted-foreground">{t("smsTopup.credits")}</span>
                </div>
                <p className="mt-2 text-3xl font-bold">{formatCents(p.amountCents)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatCents(Math.round(perCredit))} {t("smsTopup.perCredit")}
                </p>
                <Button
                  variant={featured ? "hero" : "outline"}
                  size="sm"
                  className="mt-4 w-full"
                  disabled={!!pendingId}
                  onClick={() => startCheckout(p.id)}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      {t("smsTopup.processing")}
                    </>
                  ) : (
                    t("smsTopup.choose")
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!pendingId}>
            {t("smsTopup.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
