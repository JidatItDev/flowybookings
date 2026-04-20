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
import { enqueueBookingEmail } from "@/lib/email/enqueue-booking-email";

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
          // Optional shared-secret guard. Mollie does not sign webhook bodies, so we use a
          // query-string token (or x-webhook-token header) configured when registering
          // the webhook URL with Mollie. If MOLLIE_WEBHOOK_SECRET is set, requests
          // missing/mismatching the token are rejected as spoofed.
          const expectedSecret = process.env.MOLLIE_WEBHOOK_SECRET;
          if (expectedSecret) {
            const url = new URL(request.url);
            const provided =
              url.searchParams.get("token") ??
              request.headers.get("x-webhook-token") ??
              "";
            if (!safeEqual(provided, expectedSecret)) {
              console.warn("[mollie/webhook] rejected: invalid or missing token");
              return new Response(JSON.stringify({ error: "unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
              });
            }
          }

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

          // Platform billing payments (provider = platform_mollie, booking_id IS NULL):
          // distinguish between subscription payments and one-off SMS credit top-ups.
          if (payment.provider === PLATFORM_PROVIDER && payment.booking_id === null) {
            const meta = (payment.metadata ?? {}) as Record<string, unknown>;
            const effectiveStatus = newStatus ?? payment.status;
            if (meta.kind === "sms_credits") {
              await handleSmsCreditsLifecycle({
                paymentId: payment.id,
                shopId: payment.shop_id,
                metadata: meta,
                effectiveStatus,
              });
            } else {
              await handleSubscriptionLifecycle({
                paymentId: payment.id,
                shopId: payment.shop_id,
                metadata: meta,
                effectiveStatus,
              });
            }
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

// Constant-time string comparison to avoid timing attacks on the shared-secret guard.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
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
      .select("plan, plan_expires_at, onboarding, name")
      .eq("id", opts.shopId)
      .maybeSingle();

    const onboarding = ((prevShop?.onboarding ?? {}) as Record<string, unknown>);
    const mollieKey = process.env.MOLLIE_API_KEY;
    const mollieCustomerId =
      (opts.metadata.mollie_customer_id as string | undefined) ??
      (onboarding.mollie_customer_id as string | undefined) ??
      null;

    // If this was a sequenceType:first payment, create the actual recurring Subscription on Mollie now.
    let mollieSubscriptionId: string | null = (onboarding.mollie_subscription_id as string | undefined) ?? null;
    if (mollieKey && mollieCustomerId && !mollieSubscriptionId && opts.metadata.kind === "subscription_first") {
      const amountValue = ((subscriptionAmountCents(plan, cycle)) / 100).toFixed(2);
      const subRes = await fetch(`https://api.mollie.com/v2/customers/${mollieCustomerId}/subscriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: { currency: "EUR", value: amountValue },
          interval: cycle === "yearly" ? "12 months" : "1 month",
          description: `FlowyBookings ${plan.toUpperCase()} abonnement`,
          webhookUrl: new URL("/api/mollie/webhook", process.env.APP_URL ?? "https://www.flowybookings.com").toString(),
          metadata: { shop_id: opts.shopId, plan, cycle, kind: "subscription_recurring" },
        }),
      });
      if (subRes.ok) {
        const sub = (await subRes.json()) as { id: string };
        mollieSubscriptionId = sub.id;
      } else {
        console.error("[mollie/webhook] subscription_create_failed", await subRes.text());
      }
    }

    await supabaseAdmin
      .from("shops")
      .update({
        plan,
        plan_expires_at: expiry,
        plan_billing_cycle: cycle,
        onboarding: {
          ...onboarding,
          ...(mollieCustomerId ? { mollie_customer_id: mollieCustomerId } : {}),
          ...(mollieSubscriptionId ? { mollie_subscription_id: mollieSubscriptionId } : {}),
          subscription_status: "active",
        },
      })
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
        mollie_subscription_id: mollieSubscriptionId,
      },
    });

    await supabaseAdmin.from("notifications").insert({
      shop_id: opts.shopId,
      type: "billing",
      title: `Plan geactiveerd: ${plan.toUpperCase()}`,
      message: `Je abonnement is actief. Volgende incasso op ${new Date(expiry).toLocaleDateString("nl-NL")}.`,
      action_url: "/shop/settings",
      metadata: { kind: "subscription", subkind: "activated", plan, cycle },
    });
  } else if (opts.effectiveStatus === "failed") {
    const { data: prevShop } = await supabaseAdmin
      .from("shops")
      .select("onboarding")
      .eq("id", opts.shopId)
      .maybeSingle();
    const onboarding = ((prevShop?.onboarding ?? {}) as Record<string, unknown>);
    await supabaseAdmin
      .from("shops")
      .update({ onboarding: { ...onboarding, subscription_status: "payment_failed" } })
      .eq("id", opts.shopId);

    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: "subscription_payment_failed",
      shop_id: opts.shopId,
      metadata: { payment_id: opts.paymentId, plan, cycle },
    });
    await supabaseAdmin.from("notifications").insert({
      shop_id: opts.shopId,
      type: "billing",
      title: "Betaling abonnement mislukt",
      message: `We konden je ${plan.toUpperCase()}-betaling niet verwerken. Probeer het opnieuw.`,
      action_url: "/shop/settings",
      metadata: { kind: "subscription", subkind: "failed", plan, cycle },
    });

    // Email the shop owner so they actually see it.
    try {
      const { data: shop } = await supabaseAdmin
        .from("shops")
        .select("id, name, owner_id, email")
        .eq("id", opts.shopId)
        .maybeSingle();
      if (shop) {
        let recipient = (shop.email ?? "").trim();
        if (!recipient) {
          const { data: prof } = await supabaseAdmin
            .from("profiles").select("email").eq("id", shop.owner_id).maybeSingle();
          recipient = (prof?.email ?? "").trim();
        }
        if (recipient) {
          const cents = (opts.metadata.amount_cents as number | undefined)
            ?? subscriptionAmountCents(plan, cycle);
          const amountLabel = `€${(cents / 100).toFixed(2).replace(".", ",")}`;
          const appUrl = process.env.APP_URL ?? "https://www.flowybookings.com";
          const planLabel = `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan (${cycle === "yearly" ? "jaarlijks" : "maandelijks"})`;
          await enqueueBookingEmail({
            templateName: "platform-payment-failed",
            recipientEmail: recipient,
            idempotencyKey: `platform-payment-failed-${opts.paymentId}`,
            templateData: {
              shopName: shop.name,
              planLabel,
              amountLabel,
              retryUrl: `${appUrl}/shop/settings`,
            },
          });
        }
      }
    } catch (err) {
      console.error("[mollie/webhook] platform-payment-failed email error", err);
    }
  }
}

// Local helper — keeps webhook self-contained without circular import on platform-billing.
function subscriptionAmountCents(plan: DbPlan, cycle: BillingCycle): number {
  const monthly: Record<string, number> = { starter: 1900, pro: 4900, premium: 9900 };
  const base = monthly[plan] ?? 0;
  return cycle === "yearly" ? base * 10 : base;
}
