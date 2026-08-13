// Bump these when the corresponding policy changes.
// Format: ISO date string (YYYY-MM-DD), rendered in the user's locale.
export const LEGAL_LAST_UPDATED = {
  privacy: "2026-04-19",
  terms: "2026-04-19",
  refunds: "2026-04-19",
} as const;

export type LegalDocKey = keyof typeof LEGAL_LAST_UPDATED;

/**
 * Current published policy version — used for the per-shop acceptance check.
 * Equals the most recent date among all policy documents.
 */
export const CURRENT_POLICY_VERSION: string = (() => {
  const dates = Object.values(LEGAL_LAST_UPDATED) as string[];
  return dates.reduce((max, d) => (d > max ? d : max), dates[0]);
})();
