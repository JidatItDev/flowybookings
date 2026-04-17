import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const map: Record<string, string> = {
  // Booking
  pending: "bg-warning/15 text-warning-foreground",
  confirmed: "bg-info/15 text-info-foreground",
  completed: "bg-mint text-mint-foreground",
  cancelled: "bg-muted text-muted-foreground",
  "no-show": "bg-destructive/15 text-destructive",
  no_show: "bg-destructive/15 text-destructive",
  // Payment
  paid: "bg-mint text-mint-foreground",
  unpaid: "bg-muted text-muted-foreground",
  deposit_paid: "bg-warning/15 text-warning-foreground",
  refunded: "bg-pink text-pink-foreground",
  partial: "bg-warning/15 text-warning-foreground",
  failed: "bg-destructive/15 text-destructive",
  // Shop / user
  active: "bg-mint text-mint-foreground",
  suspended: "bg-destructive/15 text-destructive",
  // Tickets
  Open: "bg-info/15 text-info-foreground",
  "In progress": "bg-warning/15 text-warning-foreground",
  Waiting: "bg-peach text-peach-foreground",
  Resolved: "bg-mint text-mint-foreground",
  High: "bg-destructive/15 text-destructive",
  Medium: "bg-warning/15 text-warning-foreground",
  Low: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useT();
  const cls = map[status] ?? "bg-muted text-muted-foreground";
  const label = t(`status.${status}`) !== `status.${status}` ? t(`status.${status}`) : status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        cls,
        className,
      )}
    >
      {label}
    </span>
  );
}
