// Drain transactional_emails via Resend. Invoked by pg_cron and the app after enqueue.
// Auth: Authorization Bearer must equal SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_ATTEMPTS = 3;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SEND_DELAY_MS = 200;
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60;

type ServiceClient = SupabaseClient;
type QueuePayload = {
  message_id?: string;
  to?: string;
  from?: string;
  subject?: string;
  html?: string;
  text?: string;
  label?: string;
  queued_at?: string;
};
type QueueMsg = {
  msg_id: number;
  read_ct?: number;
  enqueued_at?: string;
  message: QueuePayload;
};

class ResendSendError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(status: number, body: string, retryAfterHeader: string | null) {
    super(`Resend ${status}: ${body.slice(0, 500)}`);
    this.name = "ResendSendError";
    this.status = status;
    const parsed = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    this.retryAfterSeconds =
      Number.isFinite(parsed) && parsed > 0 ? parsed : status === 429 ? 60 : null;
  }
}

function isRateLimited(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status === 429;
  }
  return error instanceof Error && error.message.includes("429");
}

function isPermanentRecipientError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 400 || status === 422;
  }
  return false;
}

function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === "object" && "retryAfterSeconds" in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60;
  }
  return 60;
}

async function sendResendEmail(payload: QueuePayload, apiKey: string): Promise<string | null> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text || undefined,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new ResendSendError(res.status, bodyText, res.headers.get("retry-after"));
  }

  try {
    const parsed = JSON.parse(bodyText) as { id?: string };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}

function metaRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function metaTries(meta: Record<string, unknown>): number {
  const n = meta.tries;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

async function loadPendingLog(
  supabase: ServiceClient,
  messageId: unknown,
): Promise<{ metadata: Record<string, unknown>; error_message: string | null } | null> {
  if (typeof messageId !== "string" || !messageId) return null;
  const { data } = await supabase
    .from("email_send_log")
    .select("metadata, error_message")
    .eq("message_id", messageId)
    .eq("status", "pending")
    .maybeSingle();
  if (!data) return null;
  return { metadata: metaRecord(data.metadata), error_message: data.error_message ?? null };
}

async function updatePendingLog(
  supabase: ServiceClient,
  messageId: unknown,
  patch: { status?: string; error_message?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  if (typeof messageId !== "string" || !messageId) return;
  const { error } = await supabase
    .from("email_send_log")
    .update(patch)
    .eq("message_id", messageId)
    .eq("status", "pending");
  if (error) {
    console.error("Failed to update email_send_log", { messageId, error });
  }
}

async function moveToDlq(
  supabase: ServiceClient,
  queue: string,
  msg: QueueMsg,
  reason?: string,
): Promise<void> {
  const payload = msg.message;
  const patch: { status: string; error_message?: string } = { status: "dlq" };
  if (reason) patch.error_message = reason.slice(0, 1000);
  await updatePendingLog(supabase, payload.message_id, patch);
  const { error } = await supabase.rpc("move_to_dlq", {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  });
  if (error) {
    console.error("Failed to move message to DLQ", { queue, msg_id: msg.msg_id, reason, error });
  }
}

function isServiceRoleCaller(token: string, serviceKey: string): boolean {
  if (token === serviceKey) return true;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return false;
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error("Missing required environment variables");
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  // Exact match OR JWT with role=service_role (gateway verify_jwt already checked signature).
  // Avoids 403 when vault holds a valid service_role JWT that differs slightly from the
  // injected SUPABASE_SERVICE_ROLE_KEY (rotation / legacy vs new key formats).
  if (!isServiceRoleCaller(token, supabaseServiceKey)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: state } = await supabase
    .from("email_send_state")
    .select("retry_after_until, batch_size, send_delay_ms, transactional_email_ttl_minutes")
    .single();

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return Response.json({ skipped: true, reason: "rate_limited" });
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE;
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS;
  const ttlMinutes = state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES;
  const queue = "transactional_emails";

  let totalProcessed = 0;

  const { data: messages, error: readError } = await supabase.rpc("read_email_batch", {
    queue_name: queue,
    batch_size: batchSize,
    vt: 30,
  });

  if (readError) {
    console.error("Failed to read email batch", { queue, error: readError });
    return Response.json({ error: "Failed to read email batch" }, { status: 500 });
  }

  if (!messages?.length) {
    return Response.json({ processed: 0 });
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as QueueMsg;
    const payload = msg.message;

    const queuedAt = payload.queued_at ?? msg.enqueued_at;
    if (queuedAt) {
      const ageMs = Date.now() - new Date(queuedAt).getTime();
      const maxAgeMs = ttlMinutes * 60 * 1000;
      if (ageMs > maxAgeMs) {
        console.warn("Email expired (TTL exceeded)", {
          queue,
          msg_id: msg.msg_id,
          queued_at: queuedAt,
          ttl_minutes: ttlMinutes,
        });
        await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes} minutes)`);
        continue;
      }
    }

    if (payload.message_id) {
      const { data: alreadySent } = await supabase
        .from("email_send_log")
        .select("id")
        .eq("message_id", payload.message_id)
        .eq("status", "sent")
        .maybeSingle();

      if (alreadySent) {
        console.warn("Skipping duplicate send (already sent)", {
          queue,
          msg_id: msg.msg_id,
          message_id: payload.message_id,
        });
        const { error: dupDelError } = await supabase.rpc("delete_email", {
          queue_name: queue,
          message_id: msg.msg_id,
        });
        if (dupDelError) {
          console.error("Failed to delete duplicate message from queue", {
            queue,
            msg_id: msg.msg_id,
            error: dupDelError,
          });
        }
        continue;
      }
    }

    const pending = await loadPendingLog(supabase, payload.message_id);
    const metadata = pending?.metadata ?? {};
    let tries = metaTries(metadata);
    if (tries === 0 && pending?.error_message) tries = 1;

    if (tries >= MAX_ATTEMPTS) {
      await moveToDlq(supabase, queue, msg);
      continue;
    }

    let rateLimited = false;
    while (tries < MAX_ATTEMPTS) {
      tries += 1;
      metadata.tries = tries;
      await updatePendingLog(supabase, payload.message_id, { metadata });

      try {
        const resendId = await sendResendEmail(payload, apiKey);
        if (resendId) metadata.resend_id = resendId;
        await updatePendingLog(supabase, payload.message_id, {
          status: "sent",
          error_message: null,
          metadata,
        });
        const { error: delError } = await supabase.rpc("delete_email", {
          queue_name: queue,
          message_id: msg.msg_id,
        });
        if (delError) {
          console.error("Failed to delete sent message from queue", {
            queue,
            msg_id: msg.msg_id,
            error: delError,
          });
        }
        totalProcessed++;
        rateLimited = false;
        break;
      } catch (error) {
        const errorMsg = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
        console.error("Email send failed", {
          queue,
          msg_id: msg.msg_id,
          tries,
          error: errorMsg,
        });

        await updatePendingLog(supabase, payload.message_id, {
          error_message: errorMsg,
          metadata,
        });

        if (isPermanentRecipientError(error) || tries >= MAX_ATTEMPTS) {
          await moveToDlq(supabase, queue, msg);
          break;
        }

        if (isRateLimited(error)) {
          const retryAfterSecs = getRetryAfterSeconds(error);
          await supabase
            .from("email_send_state")
            .update({
              retry_after_until: new Date(Date.now() + retryAfterSecs * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", 1);
          rateLimited = true;
          break;
        }

        await new Promise((r) => setTimeout(r, sendDelayMs));
      }
    }

    if (rateLimited) {
      return Response.json({ processed: totalProcessed, stopped: "rate_limited" });
    }

    if (i < messages.length - 1) {
      await new Promise((r) => setTimeout(r, sendDelayMs));
    }
  }

  return Response.json({ processed: totalProcessed });
});
