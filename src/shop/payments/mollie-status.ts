// Shared Mollie payment-status → local-status mapping. Both the platform
// billing webhook (mollie-webhook.ts) and the shop deposit webhook
// (connect-webhook.ts) previously duplicated this identically.

export type MollieRawStatus =
  | "open"
  | "pending"
  | "paid"
  | "canceled"
  | "expired"
  | "failed"
  | "authorized";

export function mapMollieStatus(
  s: MollieRawStatus | undefined | null,
): "paid" | "failed" | "unpaid" | null {
  if (!s) return null;
  if (s === "paid" || s === "authorized") return "paid";
  if (s === "failed" || s === "canceled" || s === "expired") return "failed";
  if (s === "open" || s === "pending") return "unpaid";
  return null;
}
