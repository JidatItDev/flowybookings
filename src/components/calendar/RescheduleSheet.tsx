import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/lib/i18n";
import { formatTime } from "@/lib/format";
import type { BookingWithRelations } from "@/lib/queries";

/**
 * Lightweight Reschedule sheet — purely a time picker. Owns NO mutation:
 * the parent passes the existing `reschedule` mutation handler so we never
 * duplicate booking-update logic that already lives on the calendar page.
 *
 * Mobile (<sm): bottom sheet with safe-area + sticky CTA.
 * Tablet/Desktop: classic centered modal.
 */
export function RescheduleSheet({
  booking,
  onClose,
  onConfirm,
  isPending,
}: {
  booking: BookingWithRelations | null;
  onClose: () => void;
  /** Reuses the parent's reschedule mutation. Receives the new start Date. */
  onConfirm: (booking: BookingWithRelations, newStartsAt: Date) => void;
  isPending?: boolean;
}) {
  const { t } = useT();
  const isMobile = useIsMobile();
  const open = !!booking;
  const [value, setValue] = useState("");

  // Hydrate the picker each time we open or switch booking.
  useEffect(() => {
    if (!booking) return;
    const d = new Date(booking.starts_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    setValue(
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    );
  }, [booking?.id, booking?.starts_at]);

  if (!booking) return null;

  const newStart = value ? new Date(value + "Z") : null;
  const sameAsCurrent =
    !!newStart && newStart.getTime() === new Date(booking.starts_at).getTime();
  const disabled = !newStart || Number.isNaN(newStart.getTime()) || sameAsCurrent || !!isPending;

  const body = (
    <div className="space-y-4 py-2 text-sm">
      <div className="rounded-xl bg-muted/40 p-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("calendar.when")}
        </p>
        <p className="mt-1 font-medium">
          {new Date(booking.starts_at).toLocaleDateString("nl-NL", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            timeZone: "UTC",
          })}{" "}
          · {formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}
        </p>
      </div>
      <div>
        <Label htmlFor="reschedule-dt">{t("calendar.rescheduleNewStart")}</Label>
        <Input
          id="reschedule-dt"
          type="datetime-local"
          className="h-11 sm:h-9"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {sameAsCurrent && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("calendar.rescheduleSamePicked")}
          </p>
        )}
      </div>
    </div>
  );

  const cta = (
    <>
      <Button
        variant="outline"
        onClick={onClose}
        className="h-11 w-full sm:h-9 sm:w-auto"
      >
        {t("calendar.cancel")}
      </Button>
      <Button
        variant="hero"
        disabled={disabled}
        onClick={() => newStart && onConfirm(booking, newStart)}
        className="h-11 w-full sm:h-9 sm:w-auto"
      >
        {isPending ? t("calendar.rescheduling") : t("calendar.rescheduleConfirm")}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom,0px)]"
        >
          <div
            className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted"
            aria-hidden="true"
          />
          <SheetHeader className="px-5 pb-2 pt-1 text-left">
            <SheetTitle>{t("calendar.rescheduleTitle")}</SheetTitle>
            <p className="text-xs text-muted-foreground">
              {t("calendar.rescheduleDesc")}
            </p>
          </SheetHeader>
          <div className="px-5">{body}</div>
          <div className="sticky bottom-0 mt-2 flex flex-col-reverse gap-2 border-t border-border bg-background/95 px-5 pb-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:flex-row sm:justify-end">
            {cta}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("calendar.rescheduleTitle")}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t("calendar.rescheduleDesc")}</p>
        </DialogHeader>
        {body}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cta}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
