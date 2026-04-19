// Mollie Connect incoming booking payments — a dedicated section listing only
// payments where provider='mollie_connect'. Owners can issue a refund via
// /api/bookings/refund.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  bookingsQuery,
  customersQuery,
  paymentsQuery,
  shopKeys,
} from "@/lib/queries";
import { formatCents } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
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

export function MollieConnectPayments({ shopId }: { shopId: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [refundTarget, setRefundTarget] = useState<{
    id: string;
    amount: number;
    currency: string;
  } | null>(null);

  const { data: payments = [] } = useQuery(paymentsQuery(shopId));
  const { data: bookings = [] } = useQuery(bookingsQuery(shopId));
  const { data: customers = [] } = useQuery(customersQuery(shopId));

  const rows = useMemo(
    () => payments.filter((p) => p.provider === "mollie_connect"),
    [payments],
  );

  const refundMut = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error("unauthenticated");
      const res = await fetch("/api/bookings/refund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ payment_id: paymentId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        details?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `http_${res.status}`);
      }
      return json;
    },
    onSuccess: () => {
      toast.success(t("mollieConnect.payments.refundSuccess"));
      qc.invalidateQueries({ queryKey: shopKeys.payments(shopId) });
      setRefundTarget(null);
    },
    onError: (e: Error) => {
      toast.error(`${t("mollieConnect.payments.refundError")}: ${e.message}`);
    },
  });

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
                        disabled={!canRefund || refundMut.isPending}
                        onClick={() =>
                          setRefundTarget({
                            id: p.id,
                            amount: p.amount_cents,
                            currency: p.currency,
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

      <AlertDialog
        open={!!refundTarget}
        onOpenChange={(o) => !o && setRefundTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("mollieConnect.payments.refundConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("mollieConnect.payments.refundConfirmDesc").replace(
                "{amount}",
                refundTarget
                  ? formatCents(refundTarget.amount, refundTarget.currency)
                  : "",
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
    </div>
  );
}
