// Single source of truth for the shop-wide default deposit percentage, shared
// between the Settings UI (branding.rules.defaultDepositPct) and the server
// (checkout.ts / deposit-decision.ts). Without this, the UI's fallback and the
// server's fallback could silently disagree for a shop that never saved.

export const DEFAULT_DEPOSIT_PERCENT = 20;

export function resolveShopDefaultDepositPercent(branding: unknown): number {
  if (!branding || typeof branding !== "object") return DEFAULT_DEPOSIT_PERCENT;
  const rules = (branding as Record<string, unknown>).rules;
  if (!rules || typeof rules !== "object") return DEFAULT_DEPOSIT_PERCENT;
  const raw = (rules as Record<string, unknown>).defaultDepositPct;
  if (typeof raw !== "number" || Number.isNaN(raw)) return DEFAULT_DEPOSIT_PERCENT;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
