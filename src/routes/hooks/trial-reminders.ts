// Daily cron route: finds shops on a trial that's about to end (~4 days left) and
// sends the trial-ending email to the shop owner. Idempotency key is per shop +
// per UTC date so we never send twice per day, even if cron retries.
//
// Auth: simple bearer-token check against process.env.CRON_SECRET when set.
// In dev (no CRON_SECRET) we still allow it to make manual testing easy.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueBookingEmail } from "@/lib/email/enqueue-booking-email";

export const Route = createFileRoute("/hooks/trial-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
          const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
          if (got !== cronSecret) {
            return json({ error: "unauthorized" }, 401);
          }
        }

        // Window: shops on plan='trial' whose plan_expires_at falls in (now+3d, now+5d).
        // That gives a stable "around day 4 remaining" send. We keep the window 2 days wide
        // so the cron is forgiving if it's skipped one day.
        const now = new Date();
        const lower = new Date(now.getTime() + 3 * 86400_000).toISOString();
        const upper = new Date(now.getTime() + 5 * 86400_000).toISOString();

        const { data: shops, error } = await supabaseAdmin
          .from("shops")
          .select("id, name, owner_id, email, plan, plan_expires_at")
          .eq("plan", "trial")
          .not("plan_expires_at", "is", null)
          .gte("plan_expires_at", lower)
          .lte("plan_expires_at", upper);

        if (error) return json({ error: "query_failed", details: error.message }, 500);

        const appUrl = process.env.APP_URL ?? "https://www.flowybookings.com";
        const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const results: Array<{ shop_id: string; sent: boolean; reason?: string }> = [];

        for (const shop of shops ?? []) {
          // Resolve recipient email: prefer shops.email, fallback to owner profile email.
          let recipient = (shop.email ?? "").trim();
          if (!recipient) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("email")
              .eq("id", shop.owner_id)
              .maybeSingle();
            recipient = (prof?.email ?? "").trim();
          }
          if (!recipient) {
            results.push({ shop_id: shop.id, sent: false, reason: "no_recipient" });
            continue;
          }

          const expiresAt = shop.plan_expires_at ? new Date(shop.plan_expires_at) : null;
          const daysLeft = expiresAt
            ? Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400_000))
            : 4;

          const result = await enqueueBookingEmail({
            templateName: "trial-ending",
            recipientEmail: recipient,
            idempotencyKey: `trial-ending-${shop.id}-${todayKey}`,
            templateData: {
              shopName: shop.name,
              daysLeft,
              upgradeUrl: `${appUrl}/shop/upgrade`,
            },
          });
          results.push({
            shop_id: shop.id,
            sent: result.success === true,
            reason: result.success ? undefined : (result as { reason: string }).reason,
          });
        }

        return json({ ok: true, count: results.length, results });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
