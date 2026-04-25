import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertCircle,
  Wallet,
  Plug,
  Loader2,
  Info,
  ExternalLink,
  ShieldAlert,
  Building2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import {
  paymentProviderKeys,
  shopPaymentProviderQuery,
  type ConnectionStatus,
} from "@/lib/payment-providers";
import { useShopContext } from "@/lib/shop-context";
import { assertNotImpersonating, useImpersonationReadOnly } from "@/components/ImpersonationBanner";

interface Props {
  shopId: string;
}

export function MollieConnectCard({ shopId }: Props) {
  const { t } = useT();
  const qc = useQueryClient();
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  // (no navigate needed — we use window.location for OAuth redirects)
  // Read mollie_connect=ok|error from the callback redirect to show toast.
  const search = useSearch({ strict: false }) as { mollie_connect?: string; reason?: string };
  const { data: provider, isLoading } = useQuery(shopPaymentProviderQuery(shopId));
  const { activeShop } = useShopContext();
  const shopName = activeShop?.name ?? "";
  const [preConnectOpen, setPreConnectOpen] = useState(false);

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
      assertNotImpersonating();
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
      assertNotImpersonating();
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
    onSuccess: async () => {
      toast.success(t("mollie.disconnected"));
      // Remove cached row immediately so UI cannot render stale pending/in_review
      // state for a single frame, then refetch the fresh disconnected row.
      qc.removeQueries({ queryKey: paymentProviderKeys.byShop(shopId) });
      await qc.refetchQueries({ queryKey: paymentProviderKeys.byShop(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Single source of truth: connection_status drives the visible state.
  // When disconnected/not_connected we deliberately ignore stale onboarding_status
  // so the card never shows "In behandeling" after an Ontkoppelen action.
  const status = (provider?.connection_status ?? "not_connected") as ConnectionStatus;
  const isConnected = status === "connected";
  const isPending = status === "pending";
  const isDisconnected = status === "not_connected" || status === "disconnected";
  const onboardingRaw = provider?.onboarding_status ?? "not_started";
  const onboarding = isDisconnected ? "not_started" : onboardingRaw;
  const meta = (provider?.metadata ?? {}) as Record<string, unknown>;
  const orgName = isDisconnected ? null : ((meta.organization_name as string | undefined) ?? null);
  const orgId = isDisconnected ? null : ((meta.organization_id as string | undefined) ?? null);
  // Treat anything truthy except `false` as confirmed for backwards compatibility:
  // pre-existing connections (before this UX) have no flag and stay confirmed.
  const isConfirmed = meta.connection_confirmed !== false;
  const needsConfirmation = isConnected && meta.connection_confirmed === false;

  // Mark confirmation. RLS policy `shop_payment_providers_owner_update` lets the
  // shop owner set this flag without a server round-trip — no new endpoint needed.
  const confirmConnection = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
      if (!provider) throw new Error("no_provider");
      const newMeta = { ...meta, connection_confirmed: true, confirmed_at: new Date().toISOString() };
      const { error } = await (supabase as any)
        .from("shop_payment_providers")
        .update({ metadata: newMeta })
        .eq("id", provider.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t("mollie.confirm.confirmed"));
      await qc.invalidateQueries({ queryKey: paymentProviderKeys.byShop(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // "No, reconnect" → disconnect existing, then immediately re-open the
  // pre-connect dialog. Reuses the existing disconnect + startConnect flows.
  const rejectAndReconnect = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
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
    onSuccess: async () => {
      qc.removeQueries({ queryKey: paymentProviderKeys.byShop(shopId) });
      await qc.refetchQueries({ queryKey: paymentProviderKeys.byShop(shopId) });
      toast.info(t("mollie.confirm.reconnecting"));
      setPreConnectOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
            {isConnected && isConfirmed && orgName && (
              <p className="mt-1 text-xs font-medium text-primary">{orgName}</p>
            )}
          </div>
        </div>
        {needsConfirmation ? (
          <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-peach px-2.5 py-1 text-xs font-medium text-peach-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("mollie.confirm.pendingPill")}
          </span>
        ) : (
          <StatusPill status={status} />
        )}
      </div>

      {isLoading ? (
        <div className="mt-5 h-24 animate-pulse rounded-xl bg-muted" />
      ) : needsConfirmation ? (
        // Premium, human confirmation step shown right after returning from
        // Mollie. Verifies the merchant linked the correct business.
        <div className="mt-5">
          <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-mint/30 via-card to-card shadow-soft">
            <div className="space-y-5 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-mint text-mint-foreground">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {t("mollie.confirm.title")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("mollie.confirm.subtitle")}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-gradient-brand text-base font-semibold text-primary-foreground shadow-glow">
                    {getInitials(orgName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">
                      {orgName ?? "—"}
                    </p>
                    {orgId && (
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-medium">{t("mollie.confirm.orgIdLabel")}:</span>{" "}
                        <span className="font-mono">{orgId}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t("mollie.confirm.question")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("mollie.confirm.safetyHint")}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  onClick={() => confirmConnection.mutate()}
                  disabled={confirmConnection.isPending || readOnly}
                  title={readOnlyTitle}
                  variant="hero"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {confirmConnection.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("mollie.confirm.yes")}
                  {!confirmConnection.isPending && <ArrowRight className="h-4 w-4" />}
                </Button>
                <Button
                  onClick={() => rejectAndReconnect.mutate()}
                  disabled={rejectAndReconnect.isPending || readOnly}
                  title={readOnlyTitle}
                  variant="ghost"
                  className="w-full sm:w-auto"
                >
                  {rejectAndReconnect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("mollie.confirm.no")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {isConnected && isConfirmed && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-mint/40 bg-mint/15 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-mint-foreground" />
              <div>
                <p className="font-semibold text-foreground">{t("mollie.dashboard.activeTitle")}</p>
                {orgName && (
                  <p className="text-xs text-muted-foreground">
                    {t("mollie.dashboard.connectedWith")}:{" "}
                    <span className="font-medium text-foreground">{orgName}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <Row label={t("mollie.onboarding")} value={t(`mollie.onboarding.${onboarding}`)} />
            <Row label={t("mollie.feeEnabled")} value={provider?.application_fee_enabled ? t("common.yes") : t("common.no")} />
            <Row label={t("mollie.feePercent")} value={provider?.application_fee_enabled ? t("pricing.transactionFee") : t("mollie.feeNoFee")} />
            <Row label={t("mollie.payouts")} value={t("mollie.payoutsValue")} />
          </dl>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 flex-none text-primary" />
            <p>{t("mollie.platformFeeNotice")}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {!isConnected && (
              <Button
                onClick={() => setPreConnectOpen(true)}
                disabled={startConnect.isPending || readOnly}
                title={readOnlyTitle}
                variant="hero"
              >
                {startConnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                {isPending ? t("mollie.reconnect") : t("mollie.connect")}
                {!startConnect.isPending && <ExternalLink className="h-3.5 w-3.5" />}
              </Button>
            )}
            {(isConnected || isPending) && (
              <Button onClick={() => disconnect.mutate()} disabled={disconnect.isPending || readOnly} title={readOnlyTitle} variant="outline">
                {disconnect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("mollie.disconnect")}
              </Button>
            )}
          </div>
        </>
      )}

      {/* ── PRE-CONNECT DIALOG ───────────────────────────────────────────── */}
      <Dialog open={preConnectOpen} onOpenChange={setPreConnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mollie.preConnect.title")}</DialogTitle>
            <DialogDescription>{t("mollie.preConnect.subtitle")}</DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <span>{t("mollie.preConnect.benefit1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <span>{t("mollie.preConnect.benefit2")}</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <span>{t("mollie.preConnect.benefit3")}</span>
            </li>
          </ul>

          <div className="rounded-xl border border-peach/60 bg-peach/20 p-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-5 w-5 flex-none text-peach-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t("mollie.preConnect.warningTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("mollie.preConnect.warningBody")}
                </p>
                <p className="mt-2 flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm font-semibold">
                  <Building2 className="h-4 w-4 text-primary" />
                  {shopName || "—"}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPreConnectOpen(false)}>
              {t("mollie.preConnect.cancel")}
            </Button>
            <Button
              variant="hero"
              onClick={() => {
                setPreConnectOpen(false);
                startConnect.mutate();
              }}
              disabled={startConnect.isPending || readOnly}
              title={readOnlyTitle}
            >
              {startConnect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {t("mollie.preConnect.continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
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
