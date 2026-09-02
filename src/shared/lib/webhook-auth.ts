// Shared shared-secret verification for inbound webhooks (Mollie does not sign
// webhook bodies). A query-string `token` or `x-webhook-token` header is
// compared against a server-configured secret. Used by both the platform
// Mollie webhook and the Mollie Connect (shop deposit) webhook.

export function safeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Returns true when the request is authorized to call the webhook.
 * If no `expectedSecret` is configured, the check is disabled (returns true) —
 * matches the existing opt-in behavior of MOLLIE_WEBHOOK_SECRET.
 */
export function verifyWebhookToken(
  providedToken: string | null | undefined,
  expectedSecret: string | null | undefined,
): boolean {
  if (!expectedSecret) return true;
  if (!providedToken) return false;
  return safeEqualStrings(providedToken, expectedSecret);
}
