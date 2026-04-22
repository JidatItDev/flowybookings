import { type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Shared mobile-first form shell — the canonical pattern used by the Calendar
 * "New / Edit booking" dialog. ALL create/edit forms in the shop area should
 * route through this component so the open/close behavior, sticky header,
 * sticky footer (CTA), safe-area handling and scroll behavior stay identical
 * across modules.
 *
 * Behavior:
 * - Mobile (<sm): true full-screen sheet (100dvh, edge-to-edge, no rounded
 *   corners). Only the inner content area scrolls; header + footer stay
 *   pinned even when the soft keyboard is open (dvh + sticky).
 * - Tablet/desktop (≥sm): classic centered modal with comfortable max-width.
 *
 * This component is presentation-only — it owns NO form state, NO mutations
 * and NO validation. Pages keep their existing form/state/mutation logic and
 * just pass `children` (the fields) and `footer` (the CTA buttons).
 */
export function MobileFormDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  contentClassName,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky CTA row — render <Button>s here. Wrapped in a sticky safe-area footer. */
  footer: ReactNode;
  /** Extra classes for the scrollable body wrapper. */
  contentClassName?: string;
  /** Max-width on tablet+ — md = sm:max-w-md, lg = sm:max-w-lg. */
  size?: "md" | "lg";
}) {
  const desktopMax = size === "lg" ? "sm:max-w-lg" : "sm:max-w-md";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          // Mobile (<sm): true full-screen sheet — edge-to-edge, no rounded
          // corners, no max-width. Body scroll is locked by Radix; only the
          // inner content area scrolls. Sticky header + footer stay pinned
          // while the keyboard is open thanks to dvh sizing.
          "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "left-0 top-0 translate-x-0 translate-y-0",
          // Override the inherited centered-modal zoom/slide animations and
          // use a clean bottom-sheet slide-up on mobile (matches Calendar feel).
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
          "data-[state=open]:slide-in-from-left-0 data-[state=closed]:slide-out-to-left-0",
          "data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-top-0",
          "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
          "duration-300",
          // Tablet+ (≥sm): classic centered modal — restore the standard
          // shadcn zoom-in animation by re-enabling the centered slide origins.
          "sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[92dvh] sm:w-full sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border",
          "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
          "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=closed]:slide-out-to-left-1/2",
          "sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-top-[48%]",
          "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0",
          "sm:duration-200",
          desktopMax,
        )}
      >
        <DialogHeader className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 [padding-top:max(1rem,env(safe-area-inset-top))] sm:[padding-top:1rem] text-left">
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </DialogHeader>
        <div
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:py-4",
            contentClassName,
          )}
        >
          {children}
        </div>
        <DialogFooter className="sticky bottom-0 z-10 flex-col-reverse gap-2 border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:justify-end sm:gap-2 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
