// Phase 4 webhook for Mollie payment events.
// Handles BOTH:
//   1. Platform subscription payments (provider = 'platform_mollie', booking_id IS NULL)
//      → flips shops.plan + sets plan_expires_at on success, leaves it alone on failure.
//   2. Shop booking payments (other providers / booking_id IS NOT NULL) — log only for now.
//
// Always returns 200 unless the request is malformed: Mollie retries on non-2xx.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { serverEnv } from "@/server/env";
import { BILLING_ENTITY, PLATFORM_PROVIDER, nextExpiry, type BillingCycle } from "@/admin/settings/platform-billing";
import type { DbPlan } from "@/shared/lib/plans";
import { enqueueSubscriptionEmail } from "@/email/enqueue-subscription-email";
import { enqueueBookingEmail } from "@/email/enqueue-booking-email";
import {
  getMolliePlatformKeys,
  mollieFetchWithFallback,
  platformMollieWebhookFields,
} from "@/shared/lib/mollie-platform";

type MolliePayment = {
  id: string;
  status: "open" | "pending" | "paid" | "canceled" | "expired" | "failed" | "authorized";
  metadata?: Record<string, unknown> | null;
  amount?: { currency: string; value: string };
  subscriptionId?: string;
};

export const handlers = {
      POST: async ({ request }: { request: Request }) => {
        try {
          // Optional shared-secret guard. Mollie does not sign webhook bodies, so we use a
          // query-string token (or x-webhook-token header) configured when registering
          // the webhook URL with Mollie. If MOLLIE_WEBHOOK_SECRET is set, requests
          // missing/mismatching the token are rejected as spoofed.
          const expectedSecret = serverEnv("MOLLIE_WEBHOOK_SECRET");
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

          const result = await processMolliePaymentNotification(mollieId, "received");
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[mollie/webhook] error:", err);
          return new Response(
            JSON.stringify({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    };

export async function processMolliePaymentNotification(
  mollieId: string,
  logAction: "received" | "return_sync" = "received",
): Promise<{ ingested: boolean; local_status: string | null; mollie_status: string | null }> {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, shop_id, status, provider, booking_id, metadata, amount_cents")
    .eq("provider_payment_id", mollieId)
    .maybeSingle();

  const hasMollieKey = getMolliePlatformKeys().length > 0;
  let mollie: MolliePayment | null = null;
  if (hasMollieKey && mollieId.startsWith("tr_")) {
    const fetched = await mollieFetchWithFallback(`https://api.mollie.com/v2/payments/${mollieId}`);
    if (fetched?.response.ok) {
      mollie = (await fetched.response.json()) as MolliePayment;
    }
  }

  const mappedLocalStatus = mapStatus(mollie?.status);
  console.log("[mollie/webhook]", logAction, {
    mollie_id: mollieId,
    mollie_status: mollie?.status ?? null,
    mapped_local_status: mappedLocalStatus,
    previous_local_status: payment?.status ?? null,
    provider: payment?.provider ?? null,
    shop_id: payment?.shop_id ?? null,
    kind: (payment?.metadata as Record<string, unknown> | null)?.kind ?? null,
  });
  await supabaseAdmin.from("activity_log").insert({
    entity: "mollie_webhook",
    action: logAction,
    shop_id: payment?.shop_id ?? null,
    metadata: {
      mollie_id: mollieId,
      mollie_status: mollie?.status ?? null,
      mapped_local_status: mappedLocalStatus,
      local_status: payment?.status ?? null,
      provider: payment?.provider ?? null,
    },
  });

  if (!payment) {
    const recurring = await ingestUnknownPlatformPayment(mollie, mollieId);
    return {
      ingested: Boolean(recurring),
      local_status: mappedLocalStatus,
      mollie_status: mollie?.status ?? null,
    };
  }

  const newStatus = mapStatus(mollie?.status);
  if (newStatus && newStatus !== payment.status) {
    await supabaseAdmin
      .from("payments")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", payment.id);
  }

  if (payment.status === "paid" && (newStatus === "paid" || newStatus === null)) {
    return {
      ingested: false,
      local_status: "paid",
      mollie_status: mollie?.status ?? null,
    };
  }

  const isBookingPayment = payment.booking_id !== null;
  const becameFailed = newStatus === "failed" && payment.status !== "failed";
  if (isBookingPayment && becameFailed) {
    await supabaseAdmin.from("activity_log").insert({
      entity: "payment",
      action: "payment_failed",
      shop_id: payment.shop_id,
      metadata: {
        payment_id: payment.id,
        booking_id: payment.booking_id,
        provider: payment.provider,
        mollie_id: mollieId,
        mollie_status: mollie?.status ?? null,
        amount_cents: payment.amount_cents,
      },
    });
  }

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
        rawMollieStatus: mollie?.status ?? null,
      });
    }
  }

  return {
    ingested: false,
    local_status: newStatus ?? payment.status,
    mollie_status: mollie?.status ?? null,
  };
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
  rawMollieStatus?: string | null;
}) {
  const plan = opts.metadata.plan as DbPlan | undefined;
  const cycle = (opts.metadata.cycle as BillingCycle | undefined) ?? "monthly";
  if (!plan || !["starter", "pro", "premium"].includes(plan)) return;

  // Mollie's `canceled` and `expired` on a FIRST payment mean the user
  // abandoned/timed-out checkout — not a real billing failure. We must NOT
  // mark the shop as `payment_failed` in that case (would surface a wrong
  // banner + email). Only `failed` (true decline) or canceled/expired on
  // RECURRING payments triggers the failed-banner path.
  const raw = opts.rawMollieStatus ?? null;
  const kind = (opts.metadata.kind as string | undefined) ?? null;
  const isAbandonedFirstAttempt =
    (raw === "canceled" || raw === "expired") &&
    (kind === "subscription_first" || kind === "subscription");

  if (opts.effectiveStatus === "paid") {
    const expiry = nextExpiry(new Date(), cycle).toISOString();
    const { data: prevShop } = await supabaseAdmin
      .from("shops")
      .select("plan, plan_expires_at, onboarding, name")
      .eq("id", opts.shopId)
      .maybeSingle();

    const onboarding = ((prevShop?.onboarding ?? {}) as Record<string, unknown>);
    const hasMollie = getMolliePlatformKeys().length > 0;
    const mollieCustomerId =
      (opts.metadata.mollie_customer_id as string | undefined) ??
      (onboarding.mollie_customer_id as string | undefined) ??
      null;

    // If this was a sequenceType:first payment, create the actual recurring Subscription on Mollie now.
    // The customer may live under either platform key — let the helper choose.
    let mollieSubscriptionId: string | null = (onboarding.mollie_subscription_id as string | undefined) ?? null;
    const shouldCreateSub =
      hasMollie &&
      mollieCustomerId &&
      !mollieSubscriptionId &&
      (kind === "subscription_first" ||
        kind === "subscription" ||
        kind === "subscription_upgrade");
    if (shouldCreateSub) {
      const amountValue = ((subscriptionAmountCents(plan, cycle)) / 100).toFixed(2);
      const { data: billingCfg } = await supabaseAdmin
        .from("platform_billing_config")
        .select("webhook_url_override")
        .eq("id", 1)
        .maybeSingle();
      const result = await mollieFetchWithFallback(
        `https://api.mollie.com/v2/customers/${mollieCustomerId}/subscriptions`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: { currency: "EUR", value: amountValue },
            interval: cycle === "yearly" ? "12 months" : "1 month",
            description: `FlowyBookings ${plan.toUpperCase()} abonnement`,
            ...platformMollieWebhookFields("", billingCfg?.webhook_url_override),
            metadata: { shop_id: opts.shopId, plan, cycle, kind: "subscription_recurring" },
          }),
        },
      );
      if (result?.response.ok) {
        const sub = (await result.response.json()) as { id: string };
        mollieSubscriptionId = sub.id;
      } else if (result) {
        console.error("[mollie/webhook] subscription_create_failed", await result.response.text());
      }
    } else if (
      hasMollie &&
      mollieCustomerId &&
      mollieSubscriptionId &&
      opts.metadata.kind === "subscription_upgrade"
    ) {
      const amountValue = ((subscriptionAmountCents(plan, cycle)) / 100).toFixed(2);
      const result = await mollieFetchWithFallback(
        `https://api.mollie.com/v2/customers/${mollieCustomerId}/subscriptions/${mollieSubscriptionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            amount: { currency: "EUR", value: amountValue },
            interval: cycle === "yearly" ? "12 months" : "1 month",
            description: `FlowyBookings ${plan.toUpperCase()} abonnement`,
            metadata: { shop_id: opts.shopId, plan, cycle, kind: "subscription_recurring" },
          }),
        },
      );
      if (result && !result.response.ok) {
        console.error("[mollie/webhook] subscription_patch_failed", await result.response.text());
      }
    }

    const activateAction =
      kind === "subscription_recurring"
        ? "subscription_renewed"
        : kind === "subscription_upgrade"
          ? "subscription_upgraded"
          : "subscription_activated";

    await supabaseAdmin
      .from("shops")
      .update({
        plan,
        plan_expires_at: expiry,
        plan_billing_cycle: cycle,
        pending_plan: null,
        pending_plan_effective_at: null,
        onboarding: {
          ...onboarding,
          ...(mollieCustomerId ? { mollie_customer_id: mollieCustomerId } : {}),
          ...(mollieSubscriptionId ? { mollie_subscription_id: mollieSubscriptionId } : {}),
          payment_failed_at: null,
          payment_failed_count: 0,
          subscription_cancelled_at: null,
        },
        subscription_status: "active",
      })
      .eq("id", opts.shopId);

    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: activateAction,
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

    if (kind === "subscription_recurring") {
      await applyPendingPlanIfDue(opts.shopId);
    }

    await supabaseAdmin.from("notifications").insert({
      shop_id: opts.shopId,
      type: "billing",
      title: `Plan geactiveerd: ${plan.toUpperCase()}`,
      message: `Je abonnement is actief. Volgende incasso op ${new Date(expiry).toLocaleDateString("nl-NL")}.`,
      action_url: "/shop/billing",
      metadata: { kind: "subscription", subkind: "activated", plan, cycle },
    });

    const amountLabel = `€${(subscriptionAmountCents(plan, cycle) / 100).toFixed(2).replace(".", ",")}`;
    const cycleLabel = cycle === "yearly" ? "jaarlijks" : "maandelijks";
    const expiresLabel = new Date(expiry).toLocaleDateString("nl-NL");
    const paymentMail = await enqueueSubscriptionEmail({
      type: "subscription_payment_received",
      shopId: opts.shopId,
      idempotencyKey: `subscription_payment_received:${opts.paymentId}`,
      data: { plan, amount: amountLabel, cycle: cycleLabel, expiresAt: expiresLabel },
    });
    console.log("[mollie/webhook] email subscription_payment_received", paymentMail);
    if (kind === "subscription_first" || kind === "subscription" || kind === "subscription_upgrade") {
      const changedMail = await enqueueSubscriptionEmail({
        type: "subscription_plan_changed",
        shopId: opts.shopId,
        idempotencyKey: `subscription_plan_changed:${opts.paymentId}`,
        data: { plan, oldPlan: String(prevShop?.plan ?? ""), cycle: cycleLabel },
      });
      console.log("[mollie/webhook] email subscription_plan_changed", changedMail);
    }
  } else if (opts.effectiveStatus === "failed" && isAbandonedFirstAttempt) {
    // User canceled/expired the FIRST checkout attempt → no DB state change,
    // no banner, no email. Just log it for admin visibility.
    console.log("[mollie/webhook] subscription_first abandoned", {
      shop_id: opts.shopId, payment_id: opts.paymentId, raw, plan, cycle,
    });
    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: "subscription_checkout_abandoned",
      shop_id: opts.shopId,
      metadata: { payment_id: opts.paymentId, plan, cycle, mollie_status: raw },
    });
  } else if (opts.effectiveStatus === "failed") {
    const { data: prevShop } = await supabaseAdmin
      .from("shops")
      .select("onboarding")
      .eq("id", opts.shopId)
      .maybeSingle();
    const onboarding = ((prevShop?.onboarding ?? {}) as Record<string, unknown>);
    // Set payment_failed_at on first failure only; subsequent failures bump count but keep
    // the original timestamp so the 7-day grace period starts at the FIRST failure.
    const existingFailedAt = (onboarding.payment_failed_at as string | undefined) ?? null;
    const failedAt = existingFailedAt ?? new Date().toISOString();
    const failedCount = ((onboarding.payment_failed_count as number | undefined) ?? 0) + 1;
    await supabaseAdmin
      .from("shops")
      .update({
        subscription_status: "payment_failed",
        onboarding: {
          ...onboarding,
          payment_failed_at: failedAt,
          payment_failed_count: failedCount,
        },
      })
      .eq("id", opts.shopId);

    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: "subscription_payment_failed",
      shop_id: opts.shopId,
      metadata: { payment_id: opts.paymentId, plan, cycle, failed_at: failedAt, failure_count: failedCount, mollie_status: raw },
    });
    await supabaseAdmin.from("notifications").insert({
      shop_id: opts.shopId,
      type: "billing",
      title: "Betaling abonnement mislukt",
      message: `We konden je ${plan.toUpperCase()}-betaling niet verwerken. Probeer het opnieuw.`,
      action_url: "/shop/billing",
      metadata: { kind: "subscription", subkind: "failed", plan, cycle },
    });

    // Email the shop owner so they actually see it.
    try {
      const cents = (opts.metadata.amount_cents as number | undefined)
        ?? subscriptionAmountCents(plan, cycle);
      const amountLabel = `€${(cents / 100).toFixed(2).replace(".", ",")}`;
      const appUrl = process.env.APP_URL ?? "https://www.flowybookings.com";
      await enqueueSubscriptionEmail({
        type: "platform-payment-failed",
        shopId: opts.shopId,
        idempotencyKey: `platform-payment-failed:${opts.paymentId}`,
        data: {
          plan,
          amount: amountLabel,
          retryUrl: `${appUrl}/shop/billing`,
        },
      });
    } catch (err) {
      console.error("[mollie/webhook] platform-payment-failed email error", err);
    }
  }

  console.log("[mollie/webhook] subscription_lifecycle done", {
    shop_id: opts.shopId,
    payment_id: opts.paymentId,
    effective_status: opts.effectiveStatus,
    raw_mollie_status: raw,
    kind,
    plan,
    cycle,
    abandoned_first: isAbandonedFirstAttempt,
  });
}

async function resolveShopFromMolliePayment(mollie: MolliePayment): Promise<string | null> {
  const meta = mollie.metadata ?? {};
  if (typeof meta.shop_id === "string" && meta.kind === "subscription_recurring") {
    return meta.shop_id;
  }
  if (mollie.subscriptionId) {
    const { data } = await supabaseAdmin
      .from("shops")
      .select("id, onboarding")
      .contains("onboarding", { mollie_subscription_id: mollie.subscriptionId })
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function ingestUnknownPlatformPayment(
  mollie: MolliePayment | null,
  mollieId: string,
): Promise<boolean> {
  if (!mollie || mollie.status !== "paid") return false;
  const shopId = await resolveShopFromMolliePayment(mollie);
  if (!shopId) return false;

  const meta = (mollie.metadata ?? {}) as Record<string, unknown>;
  const amountCents = mollie.amount?.value
    ? Math.round(Number.parseFloat(mollie.amount.value) * 100)
    : 0;

  const { data: inserted, error } = await supabaseAdmin
    .from("payments")
    .insert({
      shop_id: shopId,
      booking_id: null,
      amount_cents: amountCents,
      currency: mollie.amount?.currency ?? "EUR",
      status: "paid",
      provider: PLATFORM_PROVIDER,
      provider_payment_id: mollieId,
      metadata: {
        ...meta,
        kind: (meta.kind as string | undefined) ?? "subscription_recurring",
      },
    })
    .select("id, metadata")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      console.log("[mollie/webhook] already processed", mollieId);
      return true;
    }
    console.error("[mollie/webhook] recurring insert failed", error);
    return false;
  }
  if (!inserted) return true;

  await handleSubscriptionLifecycle({
    paymentId: inserted.id,
    shopId,
    metadata: (inserted.metadata ?? meta) as Record<string, unknown>,
    effectiveStatus: "paid",
    rawMollieStatus: mollie.status,
  });
  return true;
}

async function applyPendingPlanIfDue(shopId: string): Promise<void> {
  const { data: shop } = await supabaseAdmin
    .from("shops")
    .select("id, plan, pending_plan, pending_plan_effective_at")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop?.pending_plan || !shop.pending_plan_effective_at) return;
  if (new Date(shop.pending_plan_effective_at).getTime() > Date.now()) return;

  const oldPlan = shop.plan;
  const { data: updated } = await supabaseAdmin
    .from("shops")
    .update({
      plan: shop.pending_plan,
      pending_plan: null,
      pending_plan_effective_at: null,
    })
    .eq("id", shopId)
    .not("pending_plan", "is", null)
    .select("id")
    .maybeSingle();
  if (!updated) return;

  await supabaseAdmin.from("activity_log").insert({
    entity: BILLING_ENTITY,
    action: "subscription_plan_applied",
    shop_id: shopId,
    metadata: { old_plan: oldPlan, new_plan: shop.pending_plan },
  });
}

// Local helper — keeps webhook self-contained without circular import on platform-billing.
function subscriptionAmountCents(plan: DbPlan, cycle: BillingCycle): number {
  const monthly: Record<string, number> = { starter: 1900, pro: 4900, premium: 9900 };
  const base = monthly[plan] ?? 0;
  return cycle === "yearly" ? base * 10 : base;
}

// SMS credit top-up lifecycle: increases shop_sms_credits.balance on success.
// Idempotent via payments.metadata.credits_applied (set on first successful run).
async function handleSmsCreditsLifecycle(opts: {
  paymentId: string;
  shopId: string;
  metadata: Record<string, unknown>;
  effectiveStatus: string;
}) {
  const credits = Number(opts.metadata.credits ?? 0);
  const pkg = (opts.metadata.package as string | undefined) ?? null;
  if (!credits || credits <= 0) return;

  if (opts.effectiveStatus === "paid") {
    if (opts.metadata.credits_applied === true) return; // already applied — idempotency

    // Atomic-ish increment: read, write back. RPC would be safer, but the row is per-shop
    // and webhook traffic is low, so contention is negligible.
    const { data: existing } = await supabaseAdmin
      .from("shop_sms_credits")
      .select("balance, total_purchased")
      .eq("shop_id", opts.shopId)
      .maybeSingle();

    const oldBalance = existing?.balance ?? 0;
    const newBalance = oldBalance + credits;
    const resumed = oldBalance <= 0 && newBalance > 0;

    if (existing) {
      await supabaseAdmin
        .from("shop_sms_credits")
        .update({
          balance: newBalance,
          total_purchased: existing.total_purchased + credits,
          updated_at: new Date().toISOString(),
        })
        .eq("shop_id", opts.shopId);
    } else {
      await supabaseAdmin
        .from("shop_sms_credits")
        .insert({ shop_id: opts.shopId, balance: credits, total_purchased: credits });
    }

    // Mark payment as applied so retried webhooks don't double-credit.
    await supabaseAdmin
      .from("payments")
      .update({ metadata: { ...opts.metadata, credits_applied: true, applied_at: new Date().toISOString() } })
      .eq("id", opts.paymentId);

    await supabaseAdmin.from("activity_log").insert({
      entity: "sms_credits",
      action: "topup_applied",
      shop_id: opts.shopId,
      metadata: { payment_id: opts.paymentId, package: pkg, credits, old_balance: oldBalance, new_balance: newBalance },
    });

    // Wanneer saldo van 0 → > 0 gaat: SMS-herinneringen zijn weer actief.
    if (resumed) {
      await supabaseAdmin.from("activity_log").insert({
        entity: "sms_credits",
        action: "sms_resumed",
        shop_id: opts.shopId,
        metadata: { payment_id: opts.paymentId, credits, new_balance: newBalance },
      });
    }

    await supabaseAdmin.from("notifications").insert({
      shop_id: opts.shopId,
      type: "billing",
      title: resumed ? "SMS-herinneringen weer actief" : "SMS-tegoed bijgevuld",
      message: resumed
        ? `${credits} credits toegevoegd. SMS-herinneringen worden weer verstuurd.`
        : `${credits} SMS-credits zijn toegevoegd aan je saldo.`,
      action_url: "/shop/notifications",
      metadata: { kind: "sms_credits", subkind: resumed ? "resumed" : "applied", package: pkg, credits },
    });

    // Stuur bevestigingsmail naar shop owner.
    try {
      const { data: shop } = await supabaseAdmin
        .from("shops")
        .select("name, owner_id, email")
        .eq("id", opts.shopId)
        .maybeSingle();

      let recipientEmail: string | null = shop?.email ?? null;
      if (shop?.owner_id) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", shop.owner_id)
          .maybeSingle();
        if (profile?.email) recipientEmail = profile.email;
      }

      if (recipientEmail) {
        await enqueueBookingEmail({
          templateName: "sms-topup-applied",
          recipientEmail,
          idempotencyKey: `sms-topup-applied-${opts.paymentId}`,
          templateData: {
            shopName: shop?.name ?? "je zaak",
            credits,
            newBalance,
            resumed,
            dashboardUrl: "https://www.flowybookings.com/shop/notifications",
          },
        });
      }
    } catch (err) {
      console.error("[mollie-webhook] failed to enqueue sms-topup-applied email", err);
    }
  } else if (opts.effectiveStatus === "failed") {
    await supabaseAdmin.from("activity_log").insert({
      entity: "sms_credits",
      action: "topup_failed",
      shop_id: opts.shopId,
      metadata: { payment_id: opts.paymentId, package: pkg, credits },
    });
    await supabaseAdmin.from("notifications").insert({
      shop_id: opts.shopId,
      type: "billing",
      title: "SMS-betaling mislukt",
      message: `We konden je SMS-tegoed betaling (${credits} credits) niet verwerken. Probeer het opnieuw.`,
      action_url: "/shop/notifications",
      metadata: { kind: "sms_credits", subkind: "failed", package: pkg, credits },
    });
  }
}
