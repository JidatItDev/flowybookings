/** Default stale windows — override per factory when the data churn rate differs. */
export const SHOP_STALE = {
  /** Rarely edited catalogs (services, staff, links). */
  catalog: 5 * 60_000,
  /** Shop profile / settings-ish rows. */
  profile: 2 * 60_000,
  /** Operational lists that change often but aren't realtime-patched. */
  operational: 30_000,
  /** Bookings — short; calendar also patches via use-bookings-realtime. */
  bookings: 15_000,
} as const;

export const shopKeys = {
  all: (shopId: string) => ["shop", shopId] as const,
  services: (shopId: string) => ["shop", shopId, "services"] as const,
  staff: (shopId: string) => ["shop", shopId, "staff"] as const,
  staffServices: (shopId: string) => ["shop", shopId, "staff_services"] as const,
  customers: (shopId: string) => ["shop", shopId, "customers"] as const,
  customer: (shopId: string, customerId: string) =>
    ["shop", shopId, "customer", customerId] as const,
  customerPayments: (shopId: string, customerId: string) =>
    ["shop", shopId, "customer", customerId, "payments"] as const,
  bookings: (shopId: string) => ["shop", shopId, "bookings"] as const,
  payments: (shopId: string) => ["shop", shopId, "payments"] as const,
  shopFull: (shopId: string) => ["shop", shopId, "full"] as const,
  automations: (shopId: string) => ["shop", shopId, "automations"] as const,
  smsCredits: (shopId: string) => ["shop", shopId, "sms_credits"] as const,
  paymentProvidersStatus: (shopId: string) =>
    ["shop", shopId, "payment-providers-status"] as const,
};
