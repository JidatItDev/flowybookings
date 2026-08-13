// Tiny SVG occupancy ring used in calendar day-chips and "working today" strip.
// Pure presentational — receives a 0-100 percentage and a tone hint.

import { cn } from "@/shared/lib/utils";

type Props = {
  pct: number;
  size?: number;
  /** Tone overrides the auto color band. Use "current" to inherit text color (active chip). */
  tone?: "auto" | "current" | "muted";
  className?: string;
  title?: string;
  showLabel?: boolean;
};

function autoToneClass(pct: number): string {
  if (pct >= 85) return "text-destructive";
  if (pct >= 60) return "text-primary";
  if (pct >= 25) return "text-success-foreground";
  return "text-muted-foreground";
}

export function OccupancyRing({
  pct,
  size = 18,
  tone = "auto",
  className,
  title,
  showLabel = false,
}: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const stroke = Math.max(2, Math.round(size / 7));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (c * clamped) / 100;
  const colorClass =
    tone === "current"
      ? "text-current"
      : tone === "muted"
        ? "text-muted-foreground"
        : autoToneClass(clamped);

  return (
    <span
      className={cn("inline-flex items-center gap-1", colorClass, className)}
      title={title ?? `${clamped}%`}
      aria-label={title ?? `${clamped}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {showLabel && (
        <span className="text-[10px] font-semibold tabular-nums leading-none">{clamped}%</span>
      )}
    </span>
  );
}
