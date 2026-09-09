// Display helpers for currency, dates, and times.
// Use stable en-GB UTC formatting to avoid SSR/CSR hydration mismatches.

export function formatCents(
  cents: number | null | undefined,
  currency = "EUR",
): string {
  const value = (cents ?? 0) / 100;
  // Stable formatter: en-GB uses €1,234 / £1,234 etc. Same on server and client.
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// `shopTz` is an explicit IANA zone (e.g. "Asia/Karachi") — pass it wherever
// the caller has a shop in scope so the displayed time matches the shop's own
// wall clock. Omitting it keeps the old raw-UTC behavior for call sites that
// haven't been audited yet. Either way the zone is always an explicit fixed
// value, never the ambient system zone, so SSR/CSR hydration stays stable.
export function formatTime(iso: string | Date, shopTz?: string | null): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: shopTz || "UTC",
  });
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string | Date): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function relativeFromNow(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 0) return formatDate(d);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(d);
}

/** Whole-minute duration between two ISO timestamps — callers format the
 * localized "1h 30m" / "45 min" text themselves via t(), same pattern as
 * every other calendar label in ShopCalendarPage. */
export function durationMinutes(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}
