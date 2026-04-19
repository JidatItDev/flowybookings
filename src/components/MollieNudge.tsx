import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Wallet, ArrowRight, ShieldCheck, Zap, BadgePercent } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { shopPaymentProviderQuery } from "@/lib/payment-providers";
import { useT } from "@/lib/i18n";

interface Props {
  shopId: string;
}

/**
 * App-style nudge shown on /shop/payments when Mollie is not connected.
 * Also inserts a one-time billing notification so it surfaces in the inbox.
 */
export function MollieNudge({ shopId }: Props) {
  const { t } = useT();
  const { data: provider, isLoading } = useQuery(shopPaymentProviderQuery(shopId));
  const inserted = useRef(false);

  const status = provider?.connection_status ?? "not_connected";
  const needsConnect = !isLoading && (status === "not_connected" || status === "disconnected" || status === "error");

  useEffect(() => {
    if (!needsConnect || inserted.current) return;
    inserted.current = true;
    void (async () => {
      // De-dupe: only insert if no unread Mollie nudge exists for this shop.
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("shop_id", shopId)
        .eq("type", "billing")
        .contains("metadata", { kind: "mollie_not_connected" })
        .eq("is_read", false)
        .limit(1);
      if (existing && existing.length > 0) return;
      await supabase.from("notifications").insert({
        shop_id: shopId,
        type: "billing",
        title: t("mollie.nudge.notifTitle"),
        message: t("mollie.nudge.notifMessage"),
        action_url: "/shop/payments",
        metadata: { kind: "mollie_not_connected" },
      });
    })();
  }, [needsConnect, shopId, t]);

  if (isLoading || !needsConnect) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary-soft/40 p-5 shadow-soft">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("mollie.nudge.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("mollie.nudge.body")}</p>

          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            <Benefit icon={ShieldCheck} label={t("mollie.nudge.benefit1")} />
            <Benefit icon={Zap} label={t("mollie.nudge.benefit2")} />
            <Benefit icon={BadgePercent} label={t("mollie.nudge.benefit3")} />
          </ul>

          <div className="mt-4">
            <Link to="/shop/settings">
              <Button variant="hero" size="sm">
                {t("mollie.nudge.cta")} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Benefit({ icon: Icon, label }: { icon: typeof ShieldCheck; label: string }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium">{label}</span>
    </li>
  );
}
