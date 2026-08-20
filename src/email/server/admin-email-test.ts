import { sendEmail } from "@/email/send-email";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    try {
      const authHeader = request.headers.get("authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "unauthenticated" }, 401);

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);

      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userRes.user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
      if (!isAdmin) return json({ error: "forbidden" }, 403);

      const body = (await request.json().catch(() => null)) as { to?: string } | null;
      const to = (body?.to ?? "").trim();
      if (!to || !EMAIL_RE.test(to)) return json({ error: "invalid_email" }, 400);

      const result = await sendEmail({
        type: "system_test",
        to,
        data: { shopName: "FlowyBookings" },
        idempotencyKey: `system-test-${to}-${Date.now()}`,
      });

      if (!result.success) {
        return json({ ok: false, ...result }, 400);
      }

      // sendEmail already drains the Edge Function; nothing left for a second call.
      return json({ ok: true, messageId: result.messageId });
    } catch (err) {
      console.error("[admin/email-test]", err);
      const details = err instanceof Error ? err.message : String(err);
      return json({ error: "internal_error", details }, 500);
    }
  },
};
