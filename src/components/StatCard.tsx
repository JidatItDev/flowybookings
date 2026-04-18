import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "neutral";
  icon?: LucideIcon;
  accent?: "primary" | "peach" | "pink" | "mint" | "info";
}

const accentClasses: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "bg-primary-soft text-primary",
  peach: "bg-peach text-peach-foreground",
  pink: "bg-pink text-pink-foreground",
  mint: "bg-mint text-mint-foreground",
  info: "bg-info/15 text-info-foreground",
};

export function StatCard({
  label,
  value,
  delta,
  trend = "neutral",
  icon: Icon,
  accent = "primary",
}: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-soft transition-all hover:shadow-elevated sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-foreground sm:mt-2 sm:text-3xl">{value}</p>
          {delta && (
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 truncate text-xs font-medium sm:mt-2",
                trend === "up" && "text-success-foreground",
                trend === "down" && "text-destructive",
                trend === "neutral" && "text-muted-foreground",
              )}
            >
              {delta}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex h-9 w-9 flex-none items-center justify-center rounded-xl sm:h-11 sm:w-11",
              accentClasses[accent],
            )}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
