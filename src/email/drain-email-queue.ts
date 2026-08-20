import { serverEnv } from "@/server/env";

/** Drain transactional_emails via the hosted Edge Function (local + prod). */
export async function drainTransactionalEmailQueue(): Promise<unknown | null> {
  const supabaseUrl = (
    serverEnv("VITE_SUPABASE_URL") ||
    serverEnv("SUPABASE_URL") ||
    ""
  ).replace(/\/$/, "");
  const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.warn(
      "[drainTransactionalEmailQueue] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
    return null;
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/process-email-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: "{}",
    });
    if (!res.ok) {
      console.error(
        "[drainTransactionalEmailQueue] failed",
        res.status,
        await res.text(),
      );
      return null;
    }
    return await res.json().catch(() => null);
  } catch (err) {
    console.error("[drainTransactionalEmailQueue] error", err);
    return null;
  }
}
