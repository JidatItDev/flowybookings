// SMS top-up packages — single source of truth for both UI and server.
// Prices include VAT and are in EUR cents.

export type SmsPackageId = "small" | "medium" | "large";

export type SmsPackage = {
  id: SmsPackageId;
  credits: number;
  amountCents: number;
  /** Optional badge label (e.g. "Populair", "Beste deal") */
  badgeKey?: string;
};

export const SMS_PACKAGES: SmsPackage[] = [
  { id: "small", credits: 100, amountCents: 400 },
  { id: "medium", credits: 300, amountCents: 1000, badgeKey: "smsTopup.popular" },
  { id: "large", credits: 1000, amountCents: 3000, badgeKey: "smsTopup.bestDeal" },
];

export function getSmsPackage(id: string): SmsPackage | null {
  return SMS_PACKAGES.find((p) => p.id === id) ?? null;
}
