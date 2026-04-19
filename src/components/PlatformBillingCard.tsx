import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  PlayCircle,
  ShieldCheck,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  getPlatformBillingStatus,
  runPlatformBillingHealthCheck,
  type PlatformBillingHealthResult,
  type PlatformBillingStatus,
} from "@/lib/platform-billing.functions";
import { cn } from "@/lib/utils";
import { relativeFromNow } from "@/lib/format";

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No session");
  return token;
}

export function PlatformBillingCard() {
  const { t } = useT();
  const { user } = useAuth();
  const [lastCheck, setLastCheck] = useState<PlatformBillingHealthResult | null>(null);

  const statusQuery = useQuery({
    queryKey: ["platform-billing-status", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const accessToken = await getAccessToken();
      return getPlatformBillingStatus({ data: { accessToken } });
    },
  });

  const healthCheck = useMutation({
    mutationFn: async () => {
      const accessToken = await getAccessToken();
      return runPlatformBillingHealthCheck({ data: { accessToken } });
    },
    onSuccess: (res) => {
      setLastCheck(res);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      statusQuery.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = statusQuery.data;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t("platformBilling.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("platformBilling.subtitle")}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
              {t("platformBilling.adminOnly")}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={healthCheck.isPending || statusQuery.isLoading}
          onClick={() => healthCheck.mutate()}
        >
          {healthCheck.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          {t("platformBilling.runCheck")}
        </Button>
      </div>

      {statusQuery.isLoading ? (
        <div className="mt-4 h-32 animate-pulse rounded-xl bg-muted/50" />
      ) : statusQuery.error ? (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {(statusQuery.error as Error).message}
        </p>
      ) : status ? (
        <>
          <ReadinessChecklist status={status} />
          <StatusGrid status={status} />
          <WebhookRow status={status} />
          {(lastCheck || status.lastErrorMessage) && (
            <LastEvents status={status} lastCheck={lastCheck} />
          )}
        </>
      ) : null}
    </div>
  );
}

function ReadinessChecklist({ status }: { status: PlatformBillingStatus }) {
  const { t } = useT();
  const items = useMemo(
    () => [
      { ok: status.apiKeyPresent, label: t("platformBilling.checklist.apiKey") },
      { ok: status.webhookConfigured, label: t("platformBilling.checklist.webhook") },
      { ok: status.totalSubscriptionPayments > 0, label: t("platformBilling.checklist.flowConnected") },
      {
        ok: status.lastSubscriptionPaymentStatus === "paid",
        label: t("platformBilling.checklist.lifecycleActive"),
      },
      { ok: true, label: t("platformBilling.checklist.adminPage") },
    ],
    [status, t],
  );
  const missing = items.filter((i) => !i.ok).length;

  return (
    <div className="mt-5 rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("platformBilling.readiness")}</h3>
        {missing === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("platformBilling.statusReady")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />{" "}
            {t("platformBilling.statusMissing").replace("{n}", String(missing))}
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            {it.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success-foreground" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            )}
            <span className={cn(!it.ok && "text-muted-foreground")}>{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusGrid({ status }: { status: PlatformBillingStatus }) {
  const { t } = useT();
  const modeBadge =
    status.apiKeyMode === "live"
      ? { label: t("platformBilling.mode.live"), tone: "bg-success/15 text-success-foreground" }
      : status.apiKeyMode === "test"
        ? { label: t("platformBilling.mode.test"), tone: "bg-peach/30 text-foreground" }
        : status.apiKeyMode === "missing"
          ? { label: t("platformBilling.mode.missing"), tone: "bg-destructive/15 text-destructive" }
          : { label: t("platformBilling.mode.unknown"), tone: "bg-muted text-muted-foreground" };

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field
        icon={<KeyRound className="h-3.5 w-3.5" />}
        label={t("platformBilling.field.mode")}
        value={
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", modeBadge.tone)}>
            {modeBadge.label}
          </span>
        }
      />
      <Field
        icon={<KeyRound className="h-3.5 w-3.5" />}
        label={t("platformBilling.field.apiKey")}
        value={
          <span className="font-mono text-xs">
            {status.apiKeyPresent ? status.apiKeyMasked : t("platformBilling.notConfigured")}
          </span>
        }
      />
      <Field
        label={t("platformBilling.field.clientId")}
        value={<PresenceBadge present={status.clientIdPresent} />}
      />
      <Field
        label={t("platformBilling.field.clientSecret")}
        value={<PresenceBadge present={status.clientSecretPresent} />}
      />
    </div>
  );
}

function WebhookRow({ status }: { status: PlatformBillingStatus }) {
  const { t } = useT();
  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Webhook className="h-3.5 w-3.5 text-primary" />
        {t("platformBilling.field.webhook")}
        <PresenceBadge present={status.webhookConfigured} />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg bg-muted px-2 py-1 font-mono text-[11px]">
          {status.webhookUrl}
        </code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(status.webhookUrl);
            toast.success(t("platformBilling.copied"));
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      {status.lastWebhookAt && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("platformBilling.lastWebhook")}: {relativeFromNow(status.lastWebhookAt)}
        </p>
      )}
    </div>
  );
}

function LastEvents({
  status,
  lastCheck,
}: {
  status: PlatformBillingStatus;
  lastCheck: PlatformBillingHealthResult | null;
}) {
  const { t } = useT();
  return (
    <div className="mt-3 space-y-2">
      {lastCheck && (
        <div
          className={cn(
            "rounded-xl border p-3 text-xs",
            lastCheck.ok
              ? "border-success/30 bg-success/10 text-success-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          <p className="font-medium">{t("platformBilling.lastTest")}</p>
          <p className="mt-0.5">{lastCheck.message}</p>
        </div>
      )}
      {status.lastErrorMessage && !lastCheck && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-medium">{t("platformBilling.lastError")}</p>
          <p className="mt-0.5 break-words">{status.lastErrorMessage}</p>
          {status.lastErrorAt && (
            <p className="mt-1 text-[11px] opacity-80">{relativeFromNow(status.lastErrorAt)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="mt-1">{value}</div>
    </div>
  );
}

function PresenceBadge({ present }: { present: boolean }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        present ? "bg-success/15 text-success-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {present ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {present ? t("platformBilling.present") : t("platformBilling.absent")}
    </span>
  );
}
