// Pure decision logic for plan-cancel.ts, isolated so it's testable without
// mocking Supabase/Mollie. Never clear a shop's Mollie pointer or mark it
// cancelled locally unless we know the Mollie side is actually gone.

export type CancelOutcome =
  | { kind: "cancel"; mollieCancelled: boolean }
  | { kind: "fail"; error: string };

export function resolveCancelOutcome(opts: {
  hasMollie: boolean;
  customerId: string | null;
  subId: string | null;
  /** Result of the Mollie delete attempt, or null if no attempt was made. */
  mollieResult: { ok: boolean; error?: string } | null;
}): CancelOutcome {
  const mustCallMollie = opts.hasMollie && !!opts.customerId && !!opts.subId;
  if (!mustCallMollie) {
    return { kind: "cancel", mollieCancelled: false };
  }
  if (opts.mollieResult?.ok) {
    return { kind: "cancel", mollieCancelled: true };
  }
  return { kind: "fail", error: opts.mollieResult?.error ?? "unknown_error" };
}
