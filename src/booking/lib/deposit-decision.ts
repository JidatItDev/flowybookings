// Pure deposit-calculation logic, shared between the public booking client
// (PublicBookingFlow.tsx) and the server checkout endpoint (checkout.ts).
// Deliberately has no I/O — callers resolve `defaultDepositPercent` via
// resolveShopDefaultDepositPercent() before calling in here.

export type DepositService = {
  deposit_mode: "default" | "custom";
  deposit_cents: number;
  price_cents: number;
};

export function resolveDepositCents(service: DepositService, defaultDepositPercent: number): number {
  if (service.deposit_mode === "custom") {
    return Math.max(0, service.deposit_cents);
  }
  const pct = Math.max(0, Math.min(100, defaultDepositPercent));
  return Math.round((service.price_cents * pct) / 100);
}

export function serviceRequiresDeposit(service: DepositService, defaultDepositPercent: number): boolean {
  return resolveDepositCents(service, defaultDepositPercent) > 0;
}

/** Alias today; kept separate in case a non-Mollie payment provider is ever added. */
export function serviceRequiresMollie(service: DepositService, defaultDepositPercent: number): boolean {
  return serviceRequiresDeposit(service, defaultDepositPercent);
}
