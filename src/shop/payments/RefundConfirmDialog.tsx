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
import { formatCents } from "@/shared/lib/format";
import { useT } from "@/shared/lib/i18n";
import type { RefundTarget } from "@/shop/payments/useRefundAction";
import type { useMutation } from "@tanstack/react-query";

export function RefundConfirmDialog({
  refundTarget,
  setRefundTarget,
  refundMut,
}: {
  refundTarget: RefundTarget | null;
  setRefundTarget: (target: RefundTarget | null) => void;
  refundMut: ReturnType<typeof useMutation<unknown, Error, string>>;
}) {
  const { t } = useT();

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
