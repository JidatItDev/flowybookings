import { type LucideIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile-only floating action button. Same visual + safe-area treatment as the
 * one in shop.calendar.tsx — extracted so every list page uses one component.
 */
export function FloatingActionButton({
  onClick,
  disabled,
  title,
  ariaLabel,
  icon: Icon = Plus,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        "fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:hidden",
        className,
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
