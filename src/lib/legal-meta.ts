// Bump these when the corresponding policy changes.
// Format: ISO date string (YYYY-MM-DD), rendered in the user's locale.
export const LEGAL_LAST_UPDATED = {
  privacy: "2026-04-19",
  terms: "2026-04-19",
  refunds: "2026-04-19",
} as const;

export type LegalDocKey = keyof typeof LEGAL_LAST_UPDATED;
