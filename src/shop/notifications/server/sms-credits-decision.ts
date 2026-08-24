// Pure balance math for the SMS credit top-up webhook lifecycle, extracted from
// mollie-webhook.ts's handleSmsCreditsLifecycle for testability.

export type SmsTopupResult = {
  newBalance: number;
  /** True when the balance crossed from empty/negative to positive — SMS reminders resume. */
  resumed: boolean;
};

export function computeSmsTopupResult(oldBalance: number, credits: number): SmsTopupResult {
  const newBalance = oldBalance + credits;
  return { newBalance, resumed: oldBalance <= 0 && newBalance > 0 };
}

/** A top-up payment is only ever applied once — the webhook can be retried by Mollie. */
export function isSmsTopupAlreadyApplied(metadata: Record<string, unknown>): boolean {
  return metadata.credits_applied === true;
}
