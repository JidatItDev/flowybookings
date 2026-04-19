// Phase 4 webhook for Mollie payment events.
// Handles BOTH:
//   1. Platform subscription payments (provider = 'platform_mollie', booking_id IS NULL)
//      → flips shops.plan + sets plan_expires_at on success, leaves it alone on failure.
//   2. Shop booking payments (other providers / booking_id IS NOT NULL) — log only for now.
//
// Always returns 200 unless the request is malformed: Mollie retries on non-2xx.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BILLING_ENTITY, PLATFORM_PROVIDER, nextExpiry, type BillingCycle } from "@/lib/platform-billing";
import type { DbPlan } from "@/lib/plans";

type MolliePayment = {
  id: string;
  status: "open" | "pending" | "paid" | "canceled" | "expired" | "failed" | "authorized";
  metadata?: Record<string, unknown> | null;
  amount?: { currency: string; value: string };
};

export const Route = createFileRoute("/api/mollie/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get("content-type") ?? "";
          let mollieId: string | null = null;
          if (ct.includes("application/json")) {
            const body = (await request.json().catch(() => null)) as { id?: string } | null;
            mollieId = body?.id ?? null;
          } else {
            const form = await request.formData().catch(() => null);
            mollieId = form?.get("id")?.toString() ?? null;
          }

          if (!mollieId) {
            return new Response(JSON.stringify({ error: "missing_id" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Find the local payment row.
          const { data: payment } = await supabaseAdmin
            .from("payments")
            .select("id, shop_id, status, provider, booking_id, metadata, amount_cents")
            .eq("provider_payment_id", mollieId)
            .maybeSingle();

          // Fetch real Mollie payment (only when key is present + we recognise the id).
          const mollieKey = process.env.MOLLIE_API_KEY;
          let mollie: MolliePayment | null = null;
          if (mollieKey && mollieId.startsWith("tr_")) {
            const res = await fetch(`https://api.mollie.com/v2/payments/${mollieId}`, {
              headers: { Authorization: `Bearer ${mollieKey}` },
            });
            if (res.ok) {
              mollie = (await res.json()) as MolliePayment;
            }
          }

          // Always record the ping for audit.
          await supabaseAdmin.from("activity_log").insert({
            entity: "mollie_webhook",
            action: "received",
            shop_id: payment?.shop_id ?? null,
            metadata: {
              mollie_id: mollieId,
              mollie_status: mollie?.status ?? null,
              local_status: payment?.status ?? null,
              provider: payment?.provider ?? null,
            },
          });

          // If we don't know this payment locally, just acknowledge.
          if (!payment) return ok();

          // Map Mollie status → local payment status
          const newStatus = mapStatus(mollie?.status);
          if (newStatus && newStatus !== payment.status) {
            await supabaseAdmin
              .from("payments")
              .update({ status: newStatus, updated_at: new Date().toISOString() })
              .eq("id", payment.id);
          }

          // Platform subscription lifecycle: only run when this is a platform billing payment.
          if (payment.provider === PLATFORM_PROVIDER && payment.booking_id === null) {
            await handleSubscriptionLifecycle({
              paymentId: payment.id,
              shopId: payment.shop_id,
              metadata: (payment.metadata ?? {}) as Record<string, unknown>,
              effectiveStatus: newStatus ?? payment.status,
            });
          }

          return ok();
        } catch (err) {
          console.error("[mollie/webhook] error:", err);
          return new Response(JSON.stringify({ error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mapStatus(s: MolliePayment["status"] | undefined):
  | "paid"
  | "failed"
  | "unpaid"
  | null {
  if (!s) return null;
  if (s === "paid" || s === "authorized") return "paid";
  if (s === "failed" || s === "canceled" || s === "expired") return "failed";
  if (s === "open" || s === "pending") return "unpaid";
  return null;
}

async function handleSubscriptionLifecycle(opts: {
  paymentId: string;
  shopId: string;
  metadata: Record<string, unknown>;
  effectiveStatus: string;
}) {
  const plan = opts.metadata.plan as DbPlan | undefined;
  const cycle = (opts.metadata.cycle as BillingCycle | undefined) ?? "monthly";
  if (!plan || !["starter", "pro", "premium"].includes(plan)) return;

  if (opts.effectiveStatus === "paid") {
    const expiry = nextExpiry(new Date(), cycle).toISOString();
    const { data: prevShop } = await supabaseAdmin
      .from("shops")
      .select("plan, plan_expires_at")
      .eq("id", opts.shopId)
      .maybeSingle();

    await supabaseAdmin
      .from("shops")
      .update({ plan, plan_expires_at: expiry, plan_billing_cycle: cycle })
      .eq("id", opts.shopId);

    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: "subscription_activated",
      shop_id: opts.shopId,
      metadata: {
        payment_id: opts.paymentId,
        plan,
        cycle,
        previous_plan: prevShop?.plan ?? null,
        previous_expires_at: prevShop?.plan_expires_at ?? null,
        new_expires_at: expiry,
      },
    });

    await supabaseAdmin.from("notifications").insert({
      shop_id: opts.shopId,
      type: "billing",
      title: `Plan activated: ${plan.toUpperCase()}`,
      message: `Your subscription is active until ${new Date(expiry).toLocaleDateString()}.`,
      action_url: "/shop/billing",
      metadata: { kind: "subscription", subkind: "activated", plan, cycle },
    });
  } else if (opts.effectiveStatus === "failed") {
    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: "subscription_payment_failed",
      shop_id: opts.shopId,
      metadata: { payment_id: opts.paymentId, plan, cycle },
    });
    await supabaseAdmin.from("notifications").insert({
      shop_id: opts.shopId,
      type: "billing",
      title: "Plan payment failed",
      message: `We couldn't complete your ${plan.toUpperCase()} upgrade. Please try again.`,
      action_url: "/shop/billing",
      metadata: { kind: "subscription", subkind: "failed", plan, cycle },
    });
  }
}
