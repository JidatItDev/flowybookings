import { useEffect, useRef } from "react";
import { Wallet, ArrowRight, ShieldCheck, Zap, BadgePercent, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { paymentProviderKeys, shopPaymentProviderQuery } from "@/shop/payments/payment-providers";
import { useT } from "@/shared/lib/i18n";
import { assertNotImpersonating, useImpersonationReadOnly } from "@/admin/impersonation/ImpersonationBanner";

interface Props {
  shopId: string;
}

/**
 * App-style nudge shown on /shop/payments when Mollie is not connected.
 * The CTA triggers the SAME authorize flow as MollieConnectCard — never duplicate.
 * Also inserts a one-time billing notification so it surfaces in the inbox.
 */
export function MollieNudge({ shopId }: Props) {
  const { t } = useT();
  const qc = useQueryClient();
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const { data: provider, isLoading } = useQuery(shopPaymentProviderQuery(shopId));
  const inserted = useRef(false);

  const status = provider?.connection_status ?? "not_connected";
  const needsConnect = !isLoading && (status === "not_connected" || status === "disconnected" || status === "error");

  // Same authorize action as MollieConnectCard — single source of truth.
  const startConnect = useMutation({
    mutationFn: async () => {
      console.debug("[MollieNudge] CTA clicked", { shopId });
      assertNotImpersonating();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("unauthenticated");
      console.debug("[MollieNudge] calling /api/mollie-connect/authorize", { shopId });
      const res = await fetch(`/api/mollie-connect/authorize?shop_id=${encodeURIComponent(shopId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { authorize_url?: string; error?: string; details?: string };
      console.debug("[MollieNudge] authorize response", { ok: res.ok, status: res.status, data });
      if (!res.ok || !data.authorize_url) {
        throw new Error(data.error || "authorize_failed");
      }
      window.location.href = data.authorize_url;
    },
    onSuccess: () => {
      console.debug("[MollieNudge] redirecting to Mollie authorize URL");
      qc.invalidateQueries({ queryKey: paymentProviderKeys.byShop(shopId) });
    },
    onError: (e: Error) => {
      console.error("[MollieNudge] connect failed", e);
      if (e.message === "mollie_connect_not_configured") {
        toast.error(t("mollie.notConfigured"));
      } else if (e.message === "unauthenticated") {
        toast.error(t("mollie.connectFailed"));
      } else {
        toast.error(`${t("mollie.connectFailed")} (${e.message})`);
      }
    },
  });

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
        .contains("metadata", { kind: "provider" })
        .eq("is_read", false)
        .limit(1);
      if (existing && existing.length > 0) return;
      await supabase.from("notifications").insert({
        shop_id: shopId,
        type: "billing",
        title: t("mollie.nudge.notifTitle"),
        message: t("mollie.nudge.notifMessage"),
        action_url: "/shop/payments",
        // metadata.kind = "provider" separates booking-payment provider events from subscription billing events.
        metadata: { kind: "provider", subkind: "mollie_not_connected" },
      });
    })();
  }, [needsConnect, shopId, t]);

  if (isLoading || !needsConnect) return null;

  const pending = startConnect.isPending;

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
            <Button
              type="button"
              variant="hero"
              size="sm"
              onClick={() => startConnect.mutate()}
              disabled={pending || readOnly}
              title={readOnlyTitle}
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("mollie.nudge.cta")}
                </>
              ) : (
                <>
                  {t("mollie.nudge.cta")} <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
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
