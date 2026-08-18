// App-facing notification email API.
//
// Adding a type later:
//   1. INSERT a row into public.email_templates (migration)
//   2. Call sendEmail({ type, to, data, idempotencyKey })
// The queue worker is unchanged.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { serverEnv } from "@/server/env";

const DEFAULT_FROM = "FlowyBookings <notify@flowybookings.com>";
const DEFAULT_SENDER_DOMAIN = "flowybookings.com";

export type SendEmailParams = {
  type: string;
  to: string;
  data?: Record<string, string | number | boolean | null | undefined>;
  idempotencyKey?: string;
};

export type SendEmailResult =
  | { success: true; queued: true; messageId: string }
  | {
    success: false;
    reason: "suppressed" | "already_sent" | "unknown_type" | "no_recipient" | "render_error";
  }
  | { success: false; reason: "error"; error: string };

function interpolate(
  template: string,
  allowedVars: string[],
  data: Record<string, string | number | boolean | null | undefined>,
): string {
  let out = template;
  for (const key of allowedVars) {
    const raw = data[key];
    const value = raw == null ? "" : String(raw);
    out = out.split(`{{${key}}}`).join(value);
  }
  return out.replace(/\{\{[^}]+\}\}/g, "");
}

function senderDomainFromFrom(from: string): string {
  const match = from.match(/@([^>]+)/);
  return match?.[1]?.trim() || DEFAULT_SENDER_DOMAIN;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const recipient = (params.to ?? "").trim();
  if (!recipient) return { success: false, reason: "no_recipient" };

  const { data: template, error: tplError } = await supabaseAdmin
    .from("email_templates")
    .select("type, subject, body_html, body_text, allowed_vars")
    .eq("type", params.type)
    .maybeSingle();

  if (tplError) {
    return { success: false, reason: "error", error: tplError.message };
  }
  if (!template) return { success: false, reason: "unknown_type" };

  const messageId = crypto.randomUUID();
  const idempotencyKey = params.idempotencyKey || messageId;
  const normalized = recipient.toLowerCase();
  const data = params.data ?? {};
  const allowedVars = template.allowed_vars ?? [];

  if (params.idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from("email_send_log")
      .select("id, status")
      .contains("metadata", { idempotency_key: params.idempotencyKey })
      .limit(1)
      .maybeSingle();
    if (existing && existing.status !== "failed") {
      return { success: false, reason: "already_sent" };
    }
  }

  const { data: suppressed, error: suppressionError } = await supabaseAdmin
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  if (suppressionError) {
    return { success: false, reason: "error", error: "Failed to verify suppression status" };
  }
  if (suppressed) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: params.type,
      recipient_email: recipient,
      status: "suppressed",
      metadata: { idempotency_key: idempotencyKey },
    });
    return { success: false, reason: "suppressed" };
  }

  let subject: string;
  let html: string;
  let text: string | undefined;
  try {
    subject = interpolate(template.subject, allowedVars, data);
    html = interpolate(template.body_html, allowedVars, data);
    text = template.body_text ? interpolate(template.body_text, allowedVars, data) : undefined;
  } catch {
    return { success: false, reason: "render_error" };
  }

  const from = serverEnv("EMAIL_FROM")?.trim() || DEFAULT_FROM;

  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: params.type,
    recipient_email: recipient,
    status: "pending",
    metadata: { idempotency_key: idempotencyKey },
  });

  const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: recipient,
      from,
      sender_domain: senderDomainFromFrom(from),
      subject,
      html,
      text: text ?? null,
      purpose: "transactional",
      label: params.type,
      idempotency_key: idempotencyKey,
      queued_at: new Date().toISOString(),
    },
  });

  if (enqueueError) {
    await supabaseAdmin
      .from("email_send_log")
      .update({
        status: "failed",
        error_message: "Failed to enqueue: " + enqueueError.message,
      })
      .eq("message_id", messageId)
      .eq("status", "pending");
    return { success: false, reason: "error", error: enqueueError.message };
  }

  return { success: true, queued: true, messageId };
}
