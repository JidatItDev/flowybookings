import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY } from "@/admin/settings/platform-billing";
import type { DbPlan } from "@/shared/lib/plans";

const ALLOWED_PLANS = new Set(["trial", "starter", "pro", "premium"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

  POST: async ({ request }: { request: Request }) => {
    try {
      const body = (await request.json().catch(() => null)) as {
        shop_id?: string;
        new_plan?: string;
        new_expires?: string | null;
        subscription_status?: string | null;
        reason?: string;
      } | null;
      const reason = (body?.reason ?? "").trim();
      if (!body?.shop_id || !body.new_plan || !ALLOWED_PLANS.has(body.new_plan) || !reason) {
        return json({ error: "invalid_input" }, 400);
      }

      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "unauthenticated" }, 401);
      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userRes.user) return json({ error: "unauthenticated" }, 401);

      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userRes.user.id);
      if (!(roles ?? []).some((r) => r.role === "super_admin")) {
        return json({ error: "forbidden" }, 403);
      }

      const { data: shop } = await supabaseAdmin
        .from("shops")
        .select("id, plan, plan_expires_at, subscription_status")
        .eq("id", body.shop_id)
        .maybeSingle();
      if (!shop) return json({ error: "shop_not_found" }, 404);

      const patch: Record<string, unknown> = { plan: body.new_plan as DbPlan };
      if (body.new_expires !== undefined) patch.plan_expires_at = body.new_expires;
      if (body.subscription_status) patch.subscription_status = body.subscription_status;

      const { error: updErr } = await supabaseAdmin.from("shops").update(patch).eq("id", shop.id);
      if (updErr) return json({ error: updErr.message }, 500);

      await supabaseAdmin.from("activity_log").insert({
        entity: BILLING_ENTITY,
        action: "admin_plan_override",
        shop_id: shop.id,
        actor_user_id: userRes.user.id,
        actor_email: userRes.user.email ?? null,
        metadata: {
          shop_id: shop.id,
          old_plan: shop.plan,
          new_plan: body.new_plan,
          old_expires: shop.plan_expires_at,
          new_expires: body.new_expires ?? shop.plan_expires_at,
          reason,
          actor_id: userRes.user.id,
        },
      });

      return json({ ok: true });
    } catch (err) {
      return json({ error: "internal_error", details: (err as Error).message }, 500);
    }
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
