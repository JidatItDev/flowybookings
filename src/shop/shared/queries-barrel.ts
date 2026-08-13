/**
 * Temporary barrel re-exporting split shop query factories.
 * Prefer importing from feature folders; this exists to ease migration.
 */
export { shopKeys, SHOP_STALE } from "./query-keys";
export { shopFullQuery } from "./queries";
export { servicesQuery } from "@/shop/services/queries";
export { staffQuery, staffServicesQuery, type StaffServiceLink } from "@/shop/staff/queries";
export {
  customersQuery,
  customerDetailQuery,
  customerPaymentsQuery,
  type CustomerPreferences,
  type CustomerDetail,
  type CustomerPaymentRow,
} from "@/shop/customers/queries";
export { bookingsQuery, type BookingWithRelations } from "@/shop/calendar/queries";
export {
  paymentsQuery,
  shopPaymentProvidersStatusQuery,
  type PaymentProviderStatusRow,
} from "@/shop/payments/queries";
export {
  shopAutomationsQuery,
  shopSmsCreditsQuery,
  SHOP_AUTOMATION_DEFAULTS,
  type ShopAutomationSettings,
  type SmsCreditsRow,
} from "@/shop/notifications/queries";
