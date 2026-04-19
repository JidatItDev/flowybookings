import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  PlayCircle,
  ShieldCheck,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  getPlatformBillingStatus,
  runPlatformBillingHealthCheck,
  updatePlatformBillingConfig,
  PLATFORM_BILLING_SECRETS,
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

const STATUS_QUERY_KEY = ["platform-billing-status"] as const;

export function PlatformBillingCard() {
  const { t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [lastCheck, setLastCheck] = useState<PlatformBillingHealthResult | null>(null);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [editingMode, setEditingMode] = useState(false);
  const [draftMode, setDraftMode] = useState<"test" | "live">("test");

  const statusQuery = useQuery({
    queryKey: [...STATUS_QUERY_KEY, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const accessToken = await getAccessToken();
      return getPlatformBillingStatus({ data: { accessToken } });
    },
  });

  const status = statusQuery.data;
  useEffect(() => {
    if (status) setDraftMode(status.configuredMode);
  }, [status?.configuredMode]);

  const refresh = () => qc.invalidateQueries({ queryKey: STATUS_QUERY_KEY });

  const healthCheck = useMutation({
    mutationFn: async () => {
      const accessToken = await getAccessToken();
      return runPlatformBillingHealthCheck({ data: { accessToken } });
    },
    onSuccess: (res) => {
      setLastCheck(res);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMode = useMutation({
    mutationFn: async (mode: "test" | "live") => {
      const accessToken = await getAccessToken();
      return updatePlatformBillingConfig({ data: { accessToken, mode } });
    },
    onSuccess: () => {
      toast.success(t("platformBilling.modeSaved"));
      setEditingMode(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        <div className="flex flex-wrap gap-2">
          <Button variant="default" size="sm" onClick={() => setSecretsOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            {t("platformBilling.manageSecrets")}
          </Button>
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
          <StatusGrid
            status={status}
            editingMode={editingMode}
            draftMode={draftMode}
            setDraftMode={setDraftMode}
            onEdit={() => setEditingMode(true)}
            onCancel={() => {
              setEditingMode(false);
              setDraftMode(status.configuredMode);
            }}
            onSave={() => saveMode.mutate(draftMode)}
            saving={saveMode.isPending}
          />
          <WebhookRow status={status} />
          <LastEvents status={status} lastCheck={lastCheck} />
        </>
      ) : null}

      <ManageSecretsDialog
        open={secretsOpen}
        onOpenChange={(o) => {
          setSecretsOpen(o);
          if (!o) refresh();
        }}
        status={status}
      />
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

function StatusGrid({
  status,
  editingMode,
  draftMode,
  setDraftMode,
  onEdit,
  onCancel,
  onSave,
  saving,
}: {
  status: PlatformBillingStatus;
  editingMode: boolean;
  draftMode: "test" | "live";
  setDraftMode: (m: "test" | "live") => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
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
      <div className="rounded-xl border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            {t("platformBilling.field.mode")}
          </p>
          {!editingMode ? (
            <button
              type="button"
              onClick={onEdit}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              {t("platformBilling.editMode")}
            </button>
          ) : null}
        </div>
        {!editingMode ? (
          <div className="mt-1 flex items-center gap-2">
            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", modeBadge.tone)}>
              {modeBadge.label}
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({status.configuredMode === "live" ? "live" : "test"})
            </span>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
              {(["test", "live"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraftMode(m)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition",
                    draftMode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {t("platformBilling.saveMode")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
              {t("platformBilling.cancel")}
            </Button>
          </div>
        )}
      </div>
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
  // Prefer the freshest in-memory result; otherwise use what's persisted in DB.
  const persistedOk = status.lastHealthStatus === "ok";
  const showPersisted =
    !lastCheck && (status.lastHealthMessage || status.lastHealthAt);

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
          <p className="mt-1 text-[11px] opacity-80">
            {t("platformBilling.lastChecked")}: {relativeFromNow(lastCheck.checkedAt)}
          </p>
        </div>
      )}
      {showPersisted && (
        <div
          className={cn(
            "rounded-xl border p-3 text-xs",
            persistedOk
              ? "border-success/30 bg-success/10 text-success-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          <p className="font-medium">{t("platformBilling.lastTest")}</p>
          {status.lastHealthMessage && <p className="mt-0.5">{status.lastHealthMessage}</p>}
          {status.lastHealthAt && (
            <p className="mt-1 text-[11px] opacity-80">
              {t("platformBilling.lastChecked")}: {relativeFromNow(status.lastHealthAt)}
            </p>
          )}
        </div>
      )}
      {status.lastErrorMessage && !lastCheck && !showPersisted && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-medium">{t("platformBilling.lastError")}</p>
          <p className="mt-0.5 break-words">{status.lastErrorMessage}</p>
          {status.lastErrorAt && (
            <p className="mt-1 text-[11px] opacity-80">{relativeFromNow(status.lastErrorAt)}</p>
          )}
        </div>
      )}
      {status.configUpdatedAt && (
        <p className="text-[11px] text-muted-foreground">
          {t("platformBilling.lastUpdated")}: {relativeFromNow(status.configUpdatedAt)}
        </p>
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

function ManageSecretsDialog({
  open,
  onOpenChange,
  status,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  status: PlatformBillingStatus | undefined;
}) {
  const { t } = useT();
  const rows: Array<{ name: string; present: boolean; required: boolean }> = [
    {
      name: PLATFORM_BILLING_SECRETS.apiKey,
      present: !!status?.apiKeyPresent,
      required: true,
    },
    {
      name: PLATFORM_BILLING_SECRETS.clientId,
      present: !!status?.clientIdPresent,
      required: false,
    },
    {
      name: PLATFORM_BILLING_SECRETS.clientSecret,
      present: !!status?.clientSecretPresent,
      required: false,
    },
    {
      name: PLATFORM_BILLING_SECRETS.webhookSecret,
      present: !!status?.webhookSecretPresent,
      required: false,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            {t("platformBilling.manageSecretsTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {t("platformBilling.manageSecretsIntro")}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <code className="block truncate font-mono text-xs">{row.name}</code>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.required ? t("platformBilling.required") : t("platformBilling.optional")}
                </p>
              </div>
              <PresenceBadge present={row.present} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(row.name);
                  toast.success(t("platformBilling.copied"));
                }}
                title={t("platformBilling.copyName")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("platformBilling.cancel")}
          </Button>
          <Button asChild>
            <a
              href="https://lovable.dev/projects/52514f54-14d9-4c88-901a-5bdc9ecb06a0/settings/secrets"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("platformBilling.openSecrets")}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
