// Mollie Connect incoming booking payments — a dedicated section listing only
// payments where provider='mollie_connect'. Owners can issue a refund via
// /api/bookings/refund (useRefundAction — shared with the calendar's
// booking-detail sheet, see docs/adr/0001-cancellation-and-refund-are-independent.md).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import {
  bookingsQuery,
  customersQuery,
  paymentsQuery,
  servicesQuery,
  shopFullQuery,
  staffQuery,
} from "@/shop/shared/queries-barrel";
import { resolveShopTimezone } from "@/shared/lib/shop-timezone";
import { formatCents } from "@/shared/lib/format";
import { useT } from "@/shared/lib/i18n";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useImpersonationReadOnly } from "@/admin/impersonation/ImpersonationBanner";
import { useRefundAction } from "@/shop/payments/useRefundAction";
import { RefundConfirmDialog } from "@/shop/payments/RefundConfirmDialog";

export function MollieConnectPayments({ shopId }: { shopId: string }) {
  const { t } = useT();
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const { refundTarget, setRefundTarget, refundMut } = useRefundAction(shopId);

  const { data: payments = [] } = useQuery(paymentsQuery(shopId));
  const { data: bookings = [] } = useQuery(bookingsQuery(shopId));
  const { data: customers = [] } = useQuery(customersQuery(shopId));
  const { data: services = [] } = useQuery(servicesQuery(shopId));
  const { data: staff = [] } = useQuery(staffQuery(shopId));
  const { data: shopFull } = useQuery(shopFullQuery(shopId));
  const shopTz = resolveShopTimezone(shopFull?.timezone);

  const rows = useMemo(
    () => payments.filter((p) => p.provider === "mollie_connect"),
    [payments],
  );

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-6 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Wallet className="h-4 w-4 text-primary" />
          {t("mollieConnect.payments.title")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("mollieConnect.payments.description")}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">
          {t("mollieConnect.payments.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left">{t("mollieConnect.payments.customer")}</th>
                <th className="px-6 py-3 text-left">{t("mollieConnect.payments.amount")}</th>
                <th className="hidden px-6 py-3 text-left md:table-cell">
                  {t("mollieConnect.payments.fee")}
                </th>
                <th className="px-6 py-3 text-left">{t("mollieConnect.payments.status")}</th>
                <th className="hidden px-6 py-3 text-left lg:table-cell">
                  {t("mollieConnect.payments.molliePaymentId")}
                </th>
                <th className="px-6 py-3 text-right">{t("mollieConnect.payments.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => {
                const booking = bookings.find((b) => b.id === p.booking_id);
                const cust = customers.find((c) => c.id === booking?.customer_id);
                const svc = services.find((s) => s.id === booking?.service_id);
                const stf = staff.find((s) => s.id === booking?.staff_id);
                const canRefund =
                  !!p.provider_payment_id &&
                  (p.status === "paid" || p.status === "deposit_paid");
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium">{cust?.full_name ?? "—"}</td>
                    <td className="px-6 py-4 font-medium">
                      {formatCents(p.amount_cents, p.currency)}
                    </td>
                    <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">
                      {p.application_fee_cents > 0
                        ? formatCents(p.application_fee_cents, p.currency)
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="hidden px-6 py-4 font-mono text-xs text-muted-foreground lg:table-cell">
                      {p.provider_payment_id ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canRefund || refundMut.isPending || readOnly}
                        title={readOnlyTitle}
                        onClick={() =>
                          setRefundTarget({
                            id: p.id,
                            amount: p.amount_cents,
                            currency: p.currency,
                            booking: booking
                              ? {
                                  customerName: cust?.full_name ?? "—",
                                  serviceName: svc?.name ?? "—",
                                  staffName: stf?.full_name ?? null,
                                  startsAt: booking.starts_at,
                                  endsAt: booking.ends_at,
                                  status: booking.status,
                                }
                              : null,
                          })
                        }
                      >
                        {t("mollieConnect.payments.refund")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RefundConfirmDialog refundTarget={refundTarget} setRefundTarget={setRefundTarget} refundMut={refundMut} shopTz={shopTz} />
    </div>
  );
}
