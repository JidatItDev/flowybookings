import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Mail, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/lib/auth-context";
import { relativeFromNow } from "@/shared/lib/format";
import { useT } from "@/shared/lib/i18n";

type EmailTemplate = {
  type: string;
  display_name: string;
  subject: string;
  body_html: string;
  allowed_vars: string[];
};

type SendLogRow = {
  id: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
  metadata: { tries?: number } | null;
};

function interpolatePreview(html: string, allowedVars: string[]): string {
  let out = html;
  const sample: Record<string, string> = { shopName: "FlowyBookings" };
  for (const key of allowedVars) {
    out = out.split(`{{${key}}}`).join(sample[key] ?? "");
  }
  return out.replace(/\{\{[^}]+\}\}/g, "");
}

export function EmailNotificationPanel() {
  const { t } = useT();
  const { session, user } = useAuth();
  const qc = useQueryClient();
  const [testTo, setTestTo] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ["admin", "email-templates"],
    queryFn: async (): Promise<EmailTemplate[]> => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("type, display_name, subject, body_html, allowed_vars")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as EmailTemplate[];
    },
  });

  const template = templatesQuery.data?.[0] ?? null;

  const logsQuery = useQuery({
    queryKey: ["admin", "email-send-log", "system_test"],
    queryFn: async (): Promise<SendLogRow[]> => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("id, recipient_email, status, error_message, created_at, metadata")
        .eq("template_name", "system_test")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as SendLogRow[];
    },
  });

  useEffect(() => {
    if (!template) return;
    setSubject(template.subject);
    setBodyHtml(template.body_html);
  }, [template?.type, template?.subject, template?.body_html]);

  const dirty =
    !!template && (subject !== template.subject || bodyHtml !== template.body_html);

  const save = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error(t("adminMessages.emailNoTemplate"));
      const { error } = await supabase
        .from("email_templates")
        .update({
          subject: subject.trim(),
          body_html: bodyHtml,
          updated_by: user?.id ?? null,
        })
        .eq("type", template.type);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("adminMessages.emailSaved"));
      qc.invalidateQueries({ queryKey: ["admin", "email-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const to = testTo.trim();
      if (!to) throw new Error(t("adminMessages.emailTestRequired"));
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error(t("adminMessages.emailTestUnauth"));
      const res = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; messageId?: string; error?: string; reason?: string; details?: string }
        | null;
      if (!res.ok || !json?.ok) {
        throw new Error(
          json?.details || json?.error || json?.reason || t("adminMessages.emailTestFailed"),
        );
      }
      return json;
    },
    onSuccess: () => {
      toast.success(t("adminMessages.emailTestQueued"));
      qc.invalidateQueries({ queryKey: ["admin", "email-send-log", "system_test"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewHtml = template
    ? interpolatePreview(bodyHtml || template.body_html, template.allowed_vars)
    : "";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">{t("adminMessages.emailTemplates")}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{t("adminMessages.emailTemplatesSub")}</p>
      </div>

      {templatesQuery.isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : templatesQuery.isError ? (
        <p className="px-4 py-10 text-center text-sm text-destructive sm:px-6">
          {templatesQuery.error.message}
        </p>
      ) : !template ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
          {t("adminMessages.emailNoTemplate")}
        </p>
      ) : (
        <div className="space-y-5 px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-medium">{template.display_name}</p>
            <p className="text-[11px] text-muted-foreground">{template.type}</p>
          </div>

          {template.allowed_vars.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">{t("adminMessages.emailVars")}</p>
              <div className="flex flex-wrap gap-1.5">
                {template.allowed_vars.map((v) => (
                  <span
                    key={v}
                    className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email-subject">{t("adminMessages.previewSubject")}</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body">{t("adminMessages.emailBodyHtml")}</Label>
            <Textarea
              id="email-body"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="min-h-[180px] font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("adminMessages.emailSave")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen((v) => !v)}>
              <Eye className="h-4 w-4" />
              {t("adminMessages.preview")}
            </Button>
          </div>

          {previewOpen && (
            <div className="overflow-hidden rounded-xl border border-border bg-white">
              <iframe
                title={template.display_name}
                srcDoc={previewHtml}
                sandbox=""
                className="h-[360px] w-full bg-white"
              />
            </div>
          )}

          <div className="border-t border-border pt-4">
            <Label htmlFor="email-test-to">{t("adminMessages.emailTestTo")}</Label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <Input
                id="email-test-to"
                type="email"
                required
                placeholder="you@example.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <Button
                variant="hero"
                onClick={() => sendTest.mutate()}
                disabled={sendTest.isPending || !testTo.trim()}
              >
                {sendTest.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t("adminMessages.emailSendTest")}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {t("adminMessages.emailTestHint")}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("adminMessages.emailRecentSends")}
            </p>
            {(logsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("adminMessages.emailNoSends")}</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {(logsQuery.data ?? []).map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        <span className="font-medium">{row.status}</span>
                        {typeof row.metadata?.tries === "number" && (
                          <span className="text-muted-foreground"> · {row.metadata.tries}/3</span>
                        )}
                        <span className="text-muted-foreground"> · {row.recipient_email}</span>
                      </p>
                      {row.error_message && (
                        <p className="truncate text-[11px] text-destructive">{row.error_message}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {relativeFromNow(row.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
