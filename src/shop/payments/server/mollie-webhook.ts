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
} from "@/shared/lib/mollie-platform";
import {
  ensureSinglePlatformSubscription,
  isoFromMollieDate,
} from "@/shop/billing/server/mollie-subscriptions";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.webhook");

type MolliePayment = {
  id: string;
  status: "open" | "pending" | "paid" | "canceled" | "expired" | "failed" | "authorized";
  metadata?: Record<string, unknown> | null;
  amount?: { currency: string; value: string };
  subscriptionId?: string;
  /** ISO date (YYYY-MM-DD) when Mollie expects collection / due. */
  dueDate?: string;
  details?: {
    transferDate?: string;
    dueDate?: string;
    [key: string]: unknown;
  } | null;
};

type MollieSubscription = {
  id: string;
  nextPaymentDate?: string | null;
  status?: string;
};

/** Best-effort next charge date from a Mollie payment (SEPA uses transferDate). */
function paymentCollectionAt(mollie: MolliePayment | null | undefined): string | null {
  if (!mollie) return null;
  const raw =
    mollie.dueDate ||
    mollie.details?.transferDate ||
    mollie.details?.dueDate ||
    null;
  return isoFromMollieDate(raw);
}

async function fetchMollieSubscriptionNextPayment(
  customerId: string,
  subscriptionId: string,
): Promise<string | null> {
  const result = await mollieFetchWithFallback(
    `https://api.mollie.com/v2/customers/${customerId}/subscriptions/${subscriptionId}`,
  );
  if (!result?.response.ok) return null;
  const sub = (await result.response.json()) as MollieSubscription;
  return isoFromMollieDate(sub.nextPaymentDate);
}

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
              log.warn("rejected_invalid_or_missing_token");
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
          log.error("webhook_error", { err });
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

  if (payment?.status === "paid") {
    log.info("already_paid_skip_mollie", {
      mollie_id: mollieId,
      payment_id: payment.id,
      shop_id: payment.shop_id,
      source: logAction,
    });
    return {
      ingested: false,
      local_status: "paid",
      mollie_status: "paid",
    };
  }

  const hasMollieKey = getMolliePlatformKeys().length > 0;
  let mollie: MolliePayment | null = null;
  if (hasMollieKey && mollieId.startsWith("tr_")) {
    const fetched = await mollieFetchWithFallback(`https://api.mollie.com/v2/payments/${mollieId}`);
    if (fetched?.response.ok) {
      mollie = (await fetched.response.json()) as MolliePayment;
    }
  }

  const mappedLocalStatus = mapStatus(mollie?.status);
  log.info(logAction, {
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
        collectionAt: paymentCollectionAt(mollie),
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
  collectionAt?: string | null;
}) {
  const plan = opts.metadata.plan as DbPlan | undefined;
  const cycle = (opts.metadata.cycle as BillingCycle | undefined) ?? "monthly";
  if (!plan || !["starter", "pro", "premium"].includes(plan)) return;

  // Mollie's `canceled`/`expired` on a FIRST payment, or any failed/canceled/expired
  // UPGRADE checkout, must NOT mark the shop payment_failed (shop may already have
  // an active Starter/Pro). Only recurring charge failures flip shop status.
  const raw = opts.rawMollieStatus ?? null;
  const kind = (opts.metadata.kind as string | undefined) ?? null;
  const isAbandonedFirstAttempt =
    (raw === "canceled" || raw === "expired") &&
    (kind === "subscription_first" || kind === "subscription");
  const isFailedUpgradeCheckout =
    kind === "subscription_upgrade" && opts.effectiveStatus === "failed";

  // Awaiting / open recurring charge (e.g. SEPA before collection): record when
  // Mollie will try — do NOT invent plan_expires_at until status is paid.
  if (opts.effectiveStatus === "unpaid" && kind === "subscription_recurring") {
    const collectionAt = opts.collectionAt;
    if (collectionAt) {
      await supabaseAdmin
        .from("shops")
        .update({
          next_billing_at: collectionAt,
          subscription_status: "active",
        })
        .eq("id", opts.shopId);
    }
    log.info("recurring_charge_awaiting", {
      shop_id: opts.shopId,
      payment_id: opts.paymentId,
      next_billing_at: collectionAt,
      mollie_status: opts.rawMollieStatus,
    });
    return;
  }

  if (opts.effectiveStatus === "paid") {
    const expiry = nextExpiry(new Date(), cycle).toISOString();
    const { data: prevShop } = await supabaseAdmin
      .from("shops")
      .select("plan, plan_expires_at, name, mollie_customer_id, mollie_subscription_id, payment_failed_at")
      .eq("id", opts.shopId)
      .maybeSingle();

    const hasMollie = getMolliePlatformKeys().length > 0;
    const mollieCustomerId =
      (opts.metadata.mollie_customer_id as string | undefined) ??
      prevShop?.mollie_customer_id ??
      null;

    // Keep exactly one Mollie subscription for this shop (cancel orphans, patch or create).
    let mollieSubscriptionId = prevShop?.mollie_subscription_id ?? null;
    let nextBillingAt: string | null = null;
    const needsSubSync =
      hasMollie &&
      mollieCustomerId &&
      (kind === "subscription_first" ||
        kind === "subscription" ||
        kind === "subscription_upgrade");
    if (needsSubSync) {
      const amountValue = ((subscriptionAmountCents(plan, cycle)) / 100).toFixed(2);
      const { data: billingCfg } = await supabaseAdmin
        .from("platform_billing_config")
        .select("webhook_url_override")
        .eq("id", 1)
        .maybeSingle();
      const synced = await ensureSinglePlatformSubscription({
        customerId: mollieCustomerId,
        shopId: opts.shopId,
        plan,
        cycle,
        amountValue,
        preferredSubId: mollieSubscriptionId,
        webhookOverride: billingCfg?.webhook_url_override,
      });
      if (synced) {
        mollieSubscriptionId = synced.subscriptionId;
        nextBillingAt = synced.nextPaymentDate;
        if (synced.cancelled.length) {
          log.info("cancelled_orphan_subscriptions", { cancelled: synced.cancelled });
        }
      } else {
        log.error("subscription_sync_failed", {
          shop_id: opts.shopId,
          customer_id: mollieCustomerId,
          preferred: mollieSubscriptionId,
        });
      }
    }

    if (!nextBillingAt && hasMollie && mollieCustomerId && mollieSubscriptionId) {
      nextBillingAt = await fetchMollieSubscriptionNextPayment(mollieCustomerId, mollieSubscriptionId);
    }
    // Fallback: next charge ≈ end of the period we just opened.
    if (!nextBillingAt) nextBillingAt = expiry;

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
        next_billing_at: nextBillingAt,
        pending_plan: null,
        pending_plan_effective_at: null,
        mollie_customer_id: mollieCustomerId,
        mollie_subscription_id: mollieSubscriptionId,
        payment_failed_at: null,
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
      message: `Je abonnement is actief. Volgende incasso op ${new Date(nextBillingAt).toLocaleDateString("nl-NL")}.`,
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
    log.info("email_subscription_payment_received", { ...paymentMail });
    if (kind === "subscription_first" || kind === "subscription" || kind === "subscription_upgrade") {
      const changedMail = await enqueueSubscriptionEmail({
        type: "subscription_plan_changed",
        shopId: opts.shopId,
        idempotencyKey: `subscription_plan_changed:${opts.paymentId}`,
        data: { plan, oldPlan: String(prevShop?.plan ?? ""), cycle: cycleLabel },
      });
      log.info("email_subscription_plan_changed", { ...changedMail });
    }
  } else if (opts.effectiveStatus === "failed" && (isAbandonedFirstAttempt || isFailedUpgradeCheckout)) {
    // Abandoned first checkout OR failed/canceled upgrade attempt → payment row
    // already failed; keep shop plan + subscription_status unchanged.
    log.info("subscription_checkout_not_completed", {
      shop_id: opts.shopId, payment_id: opts.paymentId, raw, plan, cycle, kind,
    });
    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: isFailedUpgradeCheckout
        ? "subscription_upgrade_checkout_failed"
        : "subscription_checkout_abandoned",
      shop_id: opts.shopId,
      metadata: { payment_id: opts.paymentId, plan, cycle, mollie_status: raw, kind },
    });
  } else if (opts.effectiveStatus === "failed") {
    const { data: prevShop } = await supabaseAdmin
      .from("shops")
      .select("payment_failed_at")
      .eq("id", opts.shopId)
      .maybeSingle();
    // Set payment_failed_at on first failure only; subsequent failures keep
    // the original timestamp so the 7-day grace period starts at the FIRST failure.
    const existingFailedAt = prevShop?.payment_failed_at ?? null;
    const failedAt = existingFailedAt ?? new Date().toISOString();
    await supabaseAdmin
      .from("shops")
      .update({
        subscription_status: "payment_failed",
        payment_failed_at: failedAt,
      })
      .eq("id", opts.shopId);

    await supabaseAdmin.from("activity_log").insert({
      entity: BILLING_ENTITY,
      action: "subscription_payment_failed",
      shop_id: opts.shopId,
      metadata: { payment_id: opts.paymentId, plan, cycle, failed_at: failedAt, mollie_status: raw },
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
      log.error("platform_payment_failed_email_error", { err });
    }
  }

  log.info("subscription_lifecycle_done", {
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
      .select("id")
      .eq("mollie_subscription_id", mollie.subscriptionId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function ingestUnknownPlatformPayment(
  mollie: MolliePayment | null,
  mollieId: string,
): Promise<boolean> {
  // Recurring charges often arrive before we have a local payments row — including
  // SEPA "awaiting" (open/pending). Ingest those so next_billing_at can track Mollie.
  if (!mollie) return false;
  const localStatus = mapStatus(mollie.status);
  if (!localStatus) return false;
  const shopId = await resolveShopFromMolliePayment(mollie);
  if (!shopId) return false;

  const meta = (mollie.metadata ?? {}) as Record<string, unknown>;
  const amountCents = mollie.amount?.value
    ? Math.round(Number.parseFloat(mollie.amount.value) * 100)
    : 0;
  const collectionAt = paymentCollectionAt(mollie);

  const { data: inserted, error } = await supabaseAdmin
    .from("payments")
    .insert({
      shop_id: shopId,
      booking_id: null,
      amount_cents: amountCents,
      currency: mollie.amount?.currency ?? "EUR",
      status: localStatus,
      provider: PLATFORM_PROVIDER,
      provider_payment_id: mollieId,
      metadata: {
        ...meta,
        kind: (meta.kind as string | undefined) ?? "subscription_recurring",
        ...(collectionAt ? { collection_at: collectionAt } : {}),
      },
    })
    .select("id, metadata")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      log.info("already_processed", { mollie_id: mollieId });
      // Still refresh next_billing / paid lifecycle on race with an existing row.
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("id, metadata, status")
        .eq("provider_payment_id", mollieId)
        .maybeSingle();
      if (existing) {
        if (localStatus !== existing.status) {
          await supabaseAdmin
            .from("payments")
            .update({ status: localStatus, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
        await handleSubscriptionLifecycle({
          paymentId: existing.id,
          shopId,
          metadata: (existing.metadata ?? meta) as Record<string, unknown>,
          effectiveStatus: localStatus,
          rawMollieStatus: mollie.status,
          collectionAt,
        });
      }
      return true;
    }
    log.error("recurring_insert_failed", { error });
    return false;
  }
  if (!inserted) return true;

  await handleSubscriptionLifecycle({
    paymentId: inserted.id,
    shopId,
    metadata: (inserted.metadata ?? meta) as Record<string, unknown>,
    effectiveStatus: localStatus,
    rawMollieStatus: mollie.status,
    collectionAt,
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
      log.error("sms_topup_email_failed", { err });
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
