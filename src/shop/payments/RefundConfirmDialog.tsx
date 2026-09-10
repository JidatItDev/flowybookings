// Confirm dialog for useRefundAction — extracted from MollieConnectPayments.tsx
// so it can be reused from the calendar's booking-detail sheet too.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCents, formatTime, durationMinutes } from "@/shared/lib/format";
import { useT } from "@/shared/lib/i18n";
import { StatusBadge } from "@/shared/components/StatusBadge";
import type { RefundTarget } from "@/shop/payments/useRefundAction";
import type { useMutation } from "@tanstack/react-query";

export function RefundConfirmDialog({
  refundTarget,
  setRefundTarget,
  refundMut,
  shopTz,
}: {
  refundTarget: RefundTarget | null;
  setRefundTarget: (target: RefundTarget | null) => void;
  refundMut: ReturnType<typeof useMutation<unknown, Error, string>>;
  /** Only needed when a caller passes `refundTarget.booking` (Payments page). */
  shopTz?: string | null;
}) {
  const { t, locale } = useT();
  const dateLocale = locale === "en" ? "en-US" : "nl-NL";

  return (
    <AlertDialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("mollieConnect.payments.refundConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("mollieConnect.payments.refundConfirmDesc").replace(
              "{amount}",
              refundTarget ? formatCents(refundTarget.amount, refundTarget.currency) : "",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {refundTarget?.booking && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("calendar.bookingSummary")}
              </p>
              <StatusBadge status={refundTarget.booking.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("calendar.customer")}</span>
              <span className="font-medium">{refundTarget.booking.customerName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("calendar.service")}</span>
              <span className="font-medium">{refundTarget.booking.serviceName}</span>
            </div>
            {refundTarget.booking.staffName && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("calendar.staffCol")}</span>
                <span className="font-medium">{refundTarget.booking.staffName}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("calendar.when")}</span>
              <span className="font-medium">
                {new Date(refundTarget.booking.startsAt).toLocaleDateString(dateLocale, {
                  day: "2-digit",
                  month: "short",
                  timeZone: shopTz || "UTC",
                })}
                {" · "}
                {formatTime(refundTarget.booking.startsAt, shopTz)}
                {" · "}
                {(() => {
                  const mins = durationMinutes(refundTarget.booking.startsAt, refundTarget.booking.endsAt);
                  const h = Math.floor(mins / 60);
                  const m = mins % 60;
                  return h > 0
                    ? t("calendar.durationHoursMinutes", { h, m })
                    : t("calendar.durationMinutesOnly", { min: mins });
                })()}
              </span>
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={refundMut.isPending}>
            {t("mollieConnect.payments.refundCancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={refundMut.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (refundTarget) refundMut.mutate(refundTarget.id);
            }}
          >
            {refundMut.isPending
              ? t("mollieConnect.payments.refunding")
              : t("mollieConnect.payments.refundConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
