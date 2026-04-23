import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Shared mobile-first form shell — the canonical bottom-sheet pattern used by
 * Diensten, Klanten en Personeel (Calendar uses its own inline Dialog and is
 * intentionally NOT affected by changes here).
 *
 * Behavior:
 * - Mobile (<sm): true full-screen bottom sheet that slides UP from the bottom
 *   (no diagonal). A drag handle is shown at the top; the user can swipe DOWN
 *   on the header / handle to dismiss the sheet (threshold: ≥120px or fast
 *   flick). Only the inner content area scrolls; header + footer stay pinned
 *   even when the soft keyboard is open (dvh + sticky).
 * - Tablet/desktop (≥sm): classic centered modal with zoom-in. The drag
 *   gesture is disabled — desktop users close via the X / overlay click.
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
  const isMobile = useIsMobile();

  // Swipe-down-to-close (mobile only). We track a drag offset and apply it as
  // a translateY transform; on release we either snap back or call onClose().
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pointerIdRef = useRef<number | null>(null);

  // Reset transform whenever the sheet (re-)opens or device class changes.
  useEffect(() => {
    setDragY(0);
    setIsDragging(false);
    startYRef.current = null;
    pointerIdRef.current = null;
  }, [open, isMobile]);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    startYRef.current = e.clientY;
    startTimeRef.current = Date.now();
    pointerIdRef.current = e.pointerId;
    setIsDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile || startYRef.current == null) return;
    const delta = e.clientY - startYRef.current;
    // Only allow downward drag (positive delta). Add a tiny resistance for upward.
    setDragY(delta > 0 ? delta : delta * 0.15);
  };

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile || startYRef.current == null) return;
    const delta = e.clientY - startYRef.current;
    const elapsed = Date.now() - startTimeRef.current;
    const velocity = delta / Math.max(elapsed, 1); // px / ms
    startYRef.current = null;
    pointerIdRef.current = null;
    setIsDragging(false);
    // Close when pulled far enough OR fast downward flick.
    if (delta > 120 || (velocity > 0.6 && delta > 40)) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        style={
          isMobile && dragY !== 0
            ? {
                transform: `translateY(${Math.max(dragY, 0)}px)`,
                transition: isDragging ? "none" : "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)",
              }
            : undefined
        }
        className={cn(
          // Mobile (<sm): true full-screen bottom sheet — edge-to-edge, no
          // rounded corners on the bottom, slides cleanly UP from the bottom
          // (no diagonal motion). Sticky header + footer stay pinned while
          // the keyboard is open thanks to dvh sizing.
          "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "left-0 top-0 translate-x-0 translate-y-0",
          // Override the inherited centered-modal zoom and use a clean,
          // straight bottom-sheet slide-up on mobile.
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
          "data-[state=open]:slide-in-from-left-0 data-[state=closed]:slide-out-to-left-0",
          "data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-top-0",
          "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
          "duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
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
        {/* Drag handle — mobile only. Acts as the pull-to-dismiss affordance. */}
        <div
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          className="sm:hidden flex justify-center pt-2 pb-1 touch-none cursor-grab active:cursor-grabbing bg-background/95 [padding-top:max(0.5rem,env(safe-area-inset-top))]"
          aria-hidden="true"
        >
          <span className="block h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <DialogHeader
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:[padding-top:1rem] text-left sm:cursor-default touch-pan-y"
        >
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
