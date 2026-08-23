/**
 * Keep exactly one active Mollie subscription per platform shop.
 * Mollie rejects PATCH when another active sub already uses the same description —
 * so descriptions are stable per shop (no plan name) and orphans are cancelled.
 */

import { mollieFetchWithFallback, platformMollieWebhookFields } from "@/shared/lib/mollie-platform";
import type { BillingCycle } from "@/admin/settings/platform-billing";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.mollie_sub");

export type MollieSubSummary = {
  id: string;
  status: string;
  description?: string;
  nextPaymentDate?: string | null;
  amount?: { currency: string; value: string };
};

/** Stable per shop — never include plan tier (avoids STARTER/PRO description clashes). */
export function platformSubscriptionDescription(shopId: string): string {
  const short = shopId.replace(/-/g, "").slice(0, 12);
  return `FlowyBookings ${short}`;
}

export function isoFromMollieDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00:00.000Z`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function listMollieSubscriptions(customerId: string): Promise<MollieSubSummary[]> {
  const result = await mollieFetchWithFallback(
    `https://api.mollie.com/v2/customers/${customerId}/subscriptions?limit=50`,
  );
  if (!result?.response.ok) {
    if (result) {
      log.error("list_failed", { details: await result.response.text() });
    }
    return [];
  }
  const body = (await result.response.json()) as { _embedded?: { subscriptions?: MollieSubSummary[] } };
  return body._embedded?.subscriptions ?? [];
}

export async function cancelMollieSubscription(
  customerId: string,
  subscriptionId: string,
): Promise<boolean> {
  const result = await mollieFetchWithFallback(
    `https://api.mollie.com/v2/customers/${customerId}/subscriptions/${subscriptionId}`,
    { method: "DELETE" },
  );
  if (!result) return false;
  if (result.response.ok || result.response.status === 404) return true;
  log.error("cancel_failed", { subscription_id: subscriptionId, details: await result.response.text() });
  return false;
}

/** Cancel every active subscription except `keepId` (if set). */
export async function cancelOrphanMollieSubscriptions(
  customerId: string,
  keepId: string | null,
): Promise<string[]> {
  const cancelled: string[] = [];
  const subs = await listMollieSubscriptions(customerId);
  for (const sub of subs) {
    if (sub.status !== "active" && sub.status !== "pending") continue;
    if (keepId && sub.id === keepId) continue;
    if (await cancelMollieSubscription(customerId, sub.id)) cancelled.push(sub.id);
  }
  return cancelled;
}

export async function patchMollieSubscription(opts: {
  customerId: string;
  subscriptionId: string;
  shopId: string;
  plan: string;
  cycle: BillingCycle;
  amountValue: string;
}): Promise<MollieSubSummary | null> {
  const result = await mollieFetchWithFallback(
    `https://api.mollie.com/v2/customers/${opts.customerId}/subscriptions/${opts.subscriptionId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        amount: { currency: "EUR", value: opts.amountValue },
        interval: opts.cycle === "yearly" ? "12 months" : "1 month",
        description: platformSubscriptionDescription(opts.shopId),
        metadata: {
          shop_id: opts.shopId,
          plan: opts.plan,
          cycle: opts.cycle,
          kind: "subscription_recurring",
        },
      }),
    },
  );
  if (!result?.response.ok) {
    if (result) {
      log.error("patch_failed", { details: await result.response.text() });
    }
    return null;
  }
  return (await result.response.json()) as MollieSubSummary;
}

export async function createMollieSubscription(opts: {
  customerId: string;
  shopId: string;
  plan: string;
  cycle: BillingCycle;
  amountValue: string;
  webhookOverride?: string | null;
}): Promise<MollieSubSummary | null> {
  const result = await mollieFetchWithFallback(
    `https://api.mollie.com/v2/customers/${opts.customerId}/subscriptions`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: { currency: "EUR", value: opts.amountValue },
        interval: opts.cycle === "yearly" ? "12 months" : "1 month",
        description: platformSubscriptionDescription(opts.shopId),
        ...platformMollieWebhookFields("", opts.webhookOverride),
        metadata: {
          shop_id: opts.shopId,
          plan: opts.plan,
          cycle: opts.cycle,
          kind: "subscription_recurring",
        },
      }),
    },
  );
  if (!result?.response.ok) {
    if (result) {
      log.error("create_failed", { details: await result.response.text() });
    }
    return null;
  }
  return (await result.response.json()) as MollieSubSummary;
}

/**
 * Ensure exactly one active Mollie subscription for this shop at the given amount.
 * Prefer `preferredSubId` when still active; otherwise reuse any single active sub;
 * otherwise cancel all and create fresh.
 */
export async function ensureSinglePlatformSubscription(opts: {
  customerId: string;
  shopId: string;
  plan: string;
  cycle: BillingCycle;
  amountValue: string;
  preferredSubId?: string | null;
  webhookOverride?: string | null;
}): Promise<{ subscriptionId: string; nextPaymentDate: string | null; cancelled: string[] } | null> {
  const subs = await listMollieSubscriptions(opts.customerId);
  const active = subs.filter((s) => s.status === "active" || s.status === "pending");

  let keeper: string | null = null;
  if (opts.preferredSubId && active.some((s) => s.id === opts.preferredSubId)) {
    keeper = opts.preferredSubId;
  } else if (active.length === 1) {
    keeper = active[0]!.id;
  }

  const cancelled = await cancelOrphanMollieSubscriptions(opts.customerId, keeper);

  if (keeper) {
    const patched = await patchMollieSubscription({
      customerId: opts.customerId,
      subscriptionId: keeper,
      shopId: opts.shopId,
      plan: opts.plan,
      cycle: opts.cycle,
      amountValue: opts.amountValue,
    });
    if (!patched) return null;
    return {
      subscriptionId: patched.id,
      nextPaymentDate: isoFromMollieDate(patched.nextPaymentDate),
      cancelled,
    };
  }

  const created = await createMollieSubscription({
    customerId: opts.customerId,
    shopId: opts.shopId,
    plan: opts.plan,
    cycle: opts.cycle,
    amountValue: opts.amountValue,
    webhookOverride: opts.webhookOverride,
  });
  if (!created) return null;
  return {
    subscriptionId: created.id,
    nextPaymentDate: isoFromMollieDate(created.nextPaymentDate),
    cancelled,
  };
}
