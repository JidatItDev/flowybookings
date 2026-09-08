// Shared confirm dialog for drag/resize/keyboard-move reschedule proposals in
// DayTimeGrid.tsx and WeekTimeGrid.tsx. Replaces the original Sonner-toast
// confirmation (see 2026-09-07-booking-lifecycle-handover.md's "deliberate
// deviation" note) with a modal showing what's actually changing — a plain
// confirm/cancel toast gave no room to show customer/service/old-vs-new time,
// and a modal doesn't need the anchor point a popover would (which was the
// original reason a toast was chosen over an anchored popover).
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
import { formatTime } from "@/shared/lib/format";
import { useT } from "@/shared/lib/i18n";
import type { BookingWithRelations } from "@/shop/shared/queries-barrel";

export type CustomerLite = { id: string; full_name: string };
export type ServiceLite = { id: string; name: string };

export type RescheduleParams = {
  booking: BookingWithRelations;
  newStaffId: string | null;
  newStartsAt: Date;
  newEndsAt?: Date;
};

type Props = {
  pending: RescheduleParams | null;
  shopTz: string;
  customers: CustomerLite[];
  services: ServiceLite[];
  onConfirm: (params: RescheduleParams) => void;
  onCancel: () => void;
};

export function RescheduleConfirmDialog({ pending, shopTz, customers, services, onConfirm, onCancel }: Props) {
  const { t, locale } = useT();
  const dateLocale = locale === "en" ? "en-US" : "nl-NL";

  const startChanged = pending
    ? pending.newStartsAt.getTime() !== new Date(pending.booking.starts_at).getTime()
    : false;

  const cust = pending ? customers.find((c) => c.id === pending.booking.customer_id) : undefined;
  const svc = pending ? services.find((s) => s.id === pending.booking.service_id) : undefined;

  const formatWhen = (d: Date) =>
    `${d.toLocaleDateString(dateLocale, { weekday: "short", day: "2-digit", month: "short", timeZone: shopTz })} · ${formatTime(d, shopTz)}`;

  const title = pending
    ? startChanged
      ? t("calendar.confirmMoveTitle", { time: formatTime(pending.newStartsAt, shopTz) })
      : t("calendar.confirmResizeTitle", {
          time: pending.newEndsAt ? formatTime(pending.newEndsAt, shopTz) : "",
        })
    : "";

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {startChanged ? t("calendar.confirmMoveDesc") : t("calendar.confirmResizeDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pending && (
          <div className="space-y-2 rounded-lg border border-border px-3 py-2 text-sm">
            <p className="font-medium">
              {cust?.full_name ?? "—"} · {svc?.name ?? "—"}
            </p>
            {startChanged ? (
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="line-through">{formatWhen(new Date(pending.booking.starts_at))}</span>
                <span>&rarr;</span>
                <span className="font-medium text-foreground">{formatWhen(pending.newStartsAt)}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>
                  {formatTime(pending.booking.starts_at, shopTz)}&ndash;
                  <span className="line-through">{formatTime(pending.booking.ends_at, shopTz)}</span>
                </span>
                <span>&rarr;</span>
                <span className="font-medium text-foreground">
                  {formatTime(pending.newEndsAt ?? pending.booking.ends_at, shopTz)}
                </span>
              </div>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("calendar.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => pending && onConfirm(pending)}>
            {t("calendar.confirmMoveAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
