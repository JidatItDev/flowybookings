// Shared refund mutation + confirm-target state, extracted from
// MollieConnectPayments.tsx so the booking-detail Cancel dialog (calendar)
// and the Payments page can both trigger the exact same refund flow instead
// of maintaining two copies. Refund stays fully independent of booking
// status — see docs/adr/0001-cancellation-and-refund-are-independent.md.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys } from "@/shop/shared/queries-barrel";
import { useT } from "@/shared/lib/i18n";
import { assertNotImpersonating } from "@/admin/impersonation/ImpersonationBanner";

export type RefundTarget = {
  id: string;
  amount: number;
  currency: string;
  /** Optional booking context to show in the confirm dialog — populated by
   * callers that have it in scope but don't already show it right above the
   * button (the Payments page). The calendar's Cancel dialog omits this since
   * the same info is already visible in the sheet it's nested inside. */
  booking?: {
    customerName: string;
    serviceName: string;
    staffName: string | null;
    startsAt: string;
    endsAt: string;
    status: string;
  } | null;
};

export function useRefundAction(shopId: string) {
  const { t } = useT();
  const qc = useQueryClient();
  const [refundTarget, setRefundTarget] = useState<RefundTarget | null>(null);

  const refundMut = useMutation({
    mutationFn: async (paymentId: string) => {
      assertNotImpersonating();
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

  return { refundTarget, setRefundTarget, refundMut };
}
