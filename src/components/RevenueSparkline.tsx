// Tiny SVG sparkline for monthly revenue. Pure presentational — uses semantic tokens only.

import type { MonthBucket } from "@/lib/billing-analytics";
import { formatCents } from "@/lib/format";

export function RevenueSparkline({ data, height = 120 }: { data: MonthBucket[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const W = 600;
  const H = height;
  const padX = 8;
  const padY = 8;
  const stepX = (W - padX * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = H - padY - (d.revenue / max) * (H - padY * 2);
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${points[points.length - 1]?.[0].toFixed(1)},${H - padY} L${points[0]?.[0].toFixed(1)},${H - padY} Z`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rev-fill)" />
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="hsl(var(--primary))" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between gap-1 text-[10px] text-muted-foreground">
        {data.map((d, i) => (
          <span key={d.key} className={i % 2 === 0 ? "" : "hidden sm:inline"}>{d.label}</span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Peak: {formatCents(max)}</p>
    </div>
  );
}
