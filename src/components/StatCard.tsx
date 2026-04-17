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
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-soft transition-all hover:shadow-elevated">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          {delta && (
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-1 text-xs font-medium",
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
              "flex h-11 w-11 items-center justify-center rounded-xl",
              accentClasses[accent],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
