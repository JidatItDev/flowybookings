import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VISUAL_STATUS_META, type VisualStatus } from "@/shop/calendar/booking-visual-status";
import { useT } from "@/shared/lib/i18n";

const ORDER: VisualStatus[] = [
  "confirmation_pending",
  "payment_pending",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

/** Small pinned "?" button — opens a popover explaining the stripe/icon each
 * booking block shows. Kept out-of-line (not always-visible) so it doesn't
 * compete for space with the calendar itself; the icons are meant to be
 * self-evident once learned, this is just the first-time reference. */
export function CalendarLegend() {
  const { t } = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t("calendar.legendTitle")}
          aria-label={t("calendar.legendTitle")}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("calendar.legendTitle")}
        </p>
        <div className="space-y-1.5">
          {ORDER.map((status) => {
            const meta = VISUAL_STATUS_META[status];
            const Icon = meta.icon;
            return (
              <div key={status} className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.stripeClass}`} aria-hidden />
                <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.iconClass}`} aria-hidden />
                <span className="truncate">{t(meta.labelKey)}</span>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
