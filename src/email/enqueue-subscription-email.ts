import { sendEmail } from "@/email/send-email";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SubscriptionEmailType =
  | "subscription_payment_received"
  | "subscription_plan_changed"
  | "subscription_cancelled"
  | "subscription_downgrade_scheduled"
  | "platform-payment-failed";

export async function resolveShopOwnerEmail(shopId: string): Promise<{
  to: string | null;
  shopName: string;
}> {
  const { data: shop } = await supabaseAdmin
    .from("shops")
    .select("id, name, owner_id, email")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop) return { to: null, shopName: "FlowyBookings" };
  let to = (shop.email ?? "").trim();
  if (!to) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", shop.owner_id)
      .maybeSingle();
    to = (prof?.email ?? "").trim();
  }
  if (!to && shop.owner_id) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(shop.owner_id);
    to = (authUser.user?.email ?? "").trim();
  }
  return { to: to || null, shopName: shop.name };
}

export async function enqueueSubscriptionEmail(opts: {
  type: SubscriptionEmailType;
  shopId: string;
  data?: Record<string, string | number | boolean | null | undefined>;
  idempotencyKey: string;
  to?: string;
}) {
  const resolved = opts.to
    ? { to: opts.to, shopName: opts.data?.shopName ? String(opts.data.shopName) : "FlowyBookings" }
    : await resolveShopOwnerEmail(opts.shopId);
  if (!resolved.to) {
    console.warn("[enqueueSubscriptionEmail] no_recipient", {
      type: opts.type,
      shopId: opts.shopId,
    });
    return { success: false as const, reason: "no_recipient" as const };
  }
  return sendEmail({
    type: opts.type,
    to: resolved.to,
    data: { shopName: resolved.shopName, ...opts.data },
    idempotencyKey: opts.idempotencyKey,
  });
}
