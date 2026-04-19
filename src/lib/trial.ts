// Trial state helpers — works off the existing shops.plan + shops.plan_expires_at columns.
// We treat plan === 'trial' AND plan_expires_at < now() as "expired".
// "subscription_status" lives in shops.onboarding (jsonb) and is set by the Mollie webhook.

export type TrialState = {
  isTrial: boolean;
  isExpired: boolean;
  daysLeft: number | null; // null when not on trial
  expiresAt: Date | null;
  subscriptionStatus: "trial" | "active" | "payment_failed" | "expired" | "unknown";
};

export function getTrialState(shop: {
  plan?: string | null;
  plan_expires_at?: string | null;
  onboarding?: Record<string, unknown> | null;
} | null | undefined): TrialState {
  if (!shop) {
    return { isTrial: false, isExpired: false, daysLeft: null, expiresAt: null, subscriptionStatus: "unknown" };
  }
  const isTrial = (shop.plan ?? "trial") === "trial";
  const expiresAt = shop.plan_expires_at ? new Date(shop.plan_expires_at) : null;
  const now = Date.now();
  const isExpired = isTrial && !!expiresAt && expiresAt.getTime() < now;
  const daysLeft = isTrial && expiresAt ? Math.ceil((expiresAt.getTime() - now) / (1000 * 60 * 60 * 24)) : null;
  const ob = (shop.onboarding ?? {}) as Record<string, unknown>;
  const fromOb = ob.subscription_status as string | undefined;
  const subscriptionStatus =
    (fromOb as TrialState["subscriptionStatus"]) ??
    (isTrial ? (isExpired ? "expired" : "trial") : "active");
  return { isTrial, isExpired, daysLeft, expiresAt, subscriptionStatus };
}
