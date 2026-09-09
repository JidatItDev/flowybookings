// Single source of truth for how a booking's status reads visually across the
// calendar — grid blocks (stripe + icon), the legend, and the detail sheet's
// StatusBadge. Splits the DB's single `pending` status into two UI-level
// states with genuinely different next-actions (see CONTEXT.md's
// Confirmation definition): a shop owner can't act on a payment-pending
// booking (nothing to click, waiting on the customer), but a
// confirmation-pending one is actionable right now.
import { Clock, CircleAlert, Check, CheckCheck, UserX, X, type LucideIcon } from "lucide-react";
import type { BookingWithRelations } from "@/shop/shared/queries-barrel";

export type VisualStatus =
  | "payment_pending"
  | "confirmation_pending"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled";

export function resolveVisualStatus(
  status: BookingWithRelations["status"],
  hasOpenPayment: boolean,
): VisualStatus {
  if (status === "pending") return hasOpenPayment ? "payment_pending" : "confirmation_pending";
  return status;
}

type VisualStatusMeta = {
  icon: LucideIcon;
  /** Left-edge stripe on grid blocks + legend swatch. Reuses the app's
   * semantic tokens (same ones StatusBadge already uses) for consistency. */
  stripeClass: string;
  /** Icon glyph color — same hue as stripeClass, foreground-appropriate. */
  iconClass: string;
  /** i18n key for the legend label / StatusBadge text. */
  labelKey: string;
};

export const VISUAL_STATUS_META: Record<VisualStatus, VisualStatusMeta> = {
  payment_pending: {
    icon: Clock,
    stripeClass: "bg-muted-foreground/40",
    iconClass: "text-muted-foreground",
    labelKey: "calendar.visualStatus.paymentPending",
  },
  confirmation_pending: {
    icon: CircleAlert,
    stripeClass: "bg-warning",
    iconClass: "text-warning",
    labelKey: "calendar.visualStatus.confirmationPending",
  },
  confirmed: {
    icon: Check,
    stripeClass: "bg-info",
    iconClass: "text-info",
    labelKey: "calendar.confirmed",
  },
  completed: {
    icon: CheckCheck,
    stripeClass: "bg-mint",
    iconClass: "text-mint",
    labelKey: "calendar.completed",
  },
  no_show: {
    icon: UserX,
    stripeClass: "bg-destructive",
    iconClass: "text-destructive",
    labelKey: "calendar.noShow",
  },
  cancelled: {
    icon: X,
    stripeClass: "bg-muted-foreground/40",
    iconClass: "text-muted-foreground",
    labelKey: "calendar.cancelled",
  },
};
