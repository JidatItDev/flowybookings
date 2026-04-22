import { type ReactNode } from "react";
import { Eye, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type MobileSheetAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline";
  disabled?: boolean;
  title?: string;
};

/**
 * Bottom sheet with a stack of action buttons — mirrors the pattern used in the
 * calendar's mobile booking-actions sheet. Reuse this for any list-row actions
 * (view / edit / delete) so every module feels identical on mobile.
 */
export function MobileActionSheet({
  open,
  onClose,
  title,
  description,
  preview,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  preview?: ReactNode;
  actions: MobileSheetAction[];
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
        <SheetHeader className="px-5 pb-2 pt-1 text-left">
          <SheetTitle className="truncate">{title}</SheetTitle>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </SheetHeader>
        {preview && <div className="px-5 pb-2">{preview}</div>}
        <div className="sticky bottom-0 mt-2 space-y-2 border-t border-border bg-background/95 px-5 pb-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Button
                key={a.key}
                variant={a.variant ?? "outline"}
                className={cn(
                  "h-12 w-full justify-start gap-3 text-base",
                  a.variant === "destructive" &&
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                )}
                onClick={() => {
                  onClose();
                  a.onClick();
                }}
                disabled={a.disabled}
                title={a.title}
              >
                {Icon && <Icon className="h-5 w-5" />} {a.label}
              </Button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Convenience helper: build the standard View / Edit / Delete trio so each
 * module doesn't have to redefine them. Pass `null` to skip an action.
 */
export function useStandardRowActions({
  onView,
  onEdit,
  onDelete,
  disabled,
  disabledTitle,
}: {
  onView?: (() => void) | null;
  onEdit?: (() => void) | null;
  onDelete?: (() => void) | null;
  disabled?: boolean;
  disabledTitle?: string;
}): MobileSheetAction[] {
  const { t } = useT();
  const out: MobileSheetAction[] = [];
  if (onView)
    out.push({ key: "view", label: t("mobileSheet.view"), icon: Eye, onClick: onView });
  if (onEdit)
    out.push({
      key: "edit",
      label: t("mobileSheet.edit"),
      icon: Pencil,
      onClick: onEdit,
      disabled,
      title: disabled ? disabledTitle : undefined,
    });
  if (onDelete)
    out.push({
      key: "delete",
      label: t("mobileSheet.delete"),
      icon: Trash2,
      onClick: onDelete,
      variant: "destructive",
      disabled,
      title: disabled ? disabledTitle : undefined,
    });
  return out;
}
