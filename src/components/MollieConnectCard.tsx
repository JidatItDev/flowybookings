import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Wallet, Plug, Loader2, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import {
  paymentProviderKeys,
  shopPaymentProviderQuery,
  type ConnectionStatus,
} from "@/lib/payment-providers";

interface Props {
  shopId: string;
}

export function MollieConnectCard({ shopId }: Props) {
  const { t } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Read mollie_connect=ok|error from the callback redirect to show toast.
  const search = useSearch({ strict: false }) as { mollie_connect?: string; reason?: string };
  const { data: provider, isLoading } = useQuery(shopPaymentProviderQuery(shopId));

  useEffect(() => {
    if (!search?.mollie_connect) return;
    if (search.mollie_connect === "ok") {
      toast.success(t("mollie.connected"));
    } else if (search.mollie_connect === "error") {
      toast.error(`${t("mollie.connectFailed")}${search.reason ? ` (${search.reason})` : ""}`);
    }
    qc.invalidateQueries({ queryKey: paymentProviderKeys.byShop(shopId) });
    // Strip the query params so toast doesn't refire on refresh.
    const url = new URL(window.location.href);
    url.searchParams.delete("mollie_connect");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startConnect = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Niet ingelogd");
      const res = await fetch(`/api/mollie-connect/authorize?shop_id=${encodeURIComponent(shopId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { authorize_url?: string; error?: string; details?: string };
      if (!res.ok || !data.authorize_url) {
        throw new Error(data.error || "authorize_failed");
      }
      window.location.href = data.authorize_url;
    },
    onError: (e: Error) => {
      if (e.message === "mollie_connect_not_configured") {
        toast.error(t("mollie.notConfigured"));
      } else {
        toast.error(e.message);
      }
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Niet ingelogd");
      const res = await fetch("/api/mollie-connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shop_id: shopId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "disconnect_failed");
    },
    onSuccess: () => {
      toast.success(t("mollie.disconnected"));
      qc.invalidateQueries({ queryKey: paymentProviderKeys.byShop(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (provider?.connection_status ?? "not_connected") as ConnectionStatus;
  const onboarding = provider?.onboarding_status ?? "not_started";
  const isConnected = status === "connected";
  const isPending = status === "pending";
  const meta = (provider?.metadata ?? {}) as Record<string, unknown>;
  const orgName = (meta.organization_name as string | undefined) ?? null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("mollie.title")}</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">{t("mollie.description")}</p>
            {isConnected && orgName && (
              <p className="mt-1 text-xs font-medium text-primary">{orgName}</p>
            )}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {isLoading ? (
        <div className="mt-5 h-24 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <Row label={t("mollie.onboarding")} value={t(`mollie.onboarding.${onboarding}`)} />
            <Row label={t("mollie.feeEnabled")} value={provider?.application_fee_enabled ? t("common.yes") : t("common.no")} />
            <Row label={t("mollie.feePercent")} value={`${provider?.application_fee_percent ?? 2}%`} />
            <Row label={t("mollie.payouts")} value={t("mollie.payoutsValue")} />
          </dl>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 flex-none text-primary" />
            <p>{t("mollie.platformFeeNotice")}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {!isConnected && (
              <Button onClick={() => startConnect.mutate()} disabled={startConnect.isPending} variant="hero">
                {startConnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                {isPending ? t("mollie.reconnect") : t("mollie.connect")}
                {!startConnect.isPending && <ExternalLink className="h-3.5 w-3.5" />}
              </Button>
            )}
            {(isConnected || isPending) && (
              <Button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} variant="outline">
                {disconnect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("mollie.disconnect")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: ConnectionStatus }) {
  const { t } = useT();
  const map: Record<ConnectionStatus, { cls: string; icon: React.ReactNode }> = {
    not_connected: { cls: "bg-muted text-muted-foreground", icon: <Plug className="h-3.5 w-3.5" /> },
    pending: { cls: "bg-peach text-peach-foreground", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    connected: { cls: "bg-mint text-mint-foreground", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    disconnected: { cls: "bg-muted text-muted-foreground", icon: <Plug className="h-3.5 w-3.5" /> },
    error: { cls: "bg-destructive/15 text-destructive", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  };
  const cfg = map[status];
  return (
    <span className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {t(`mollie.status.${status}`)}
    </span>
  );
}
