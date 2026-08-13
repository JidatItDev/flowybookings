/**
 * Shop timezone helpers — single source of truth for public booking + staff hours.
 *
 * Wall-clock times in the product mean **shop local time** (`shops.timezone`).
 * Storage is always UTC (`timestamptz`). Conversions use `date-fns-tz` only —
 * no manual offset arithmetic.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const DEFAULT_SHOP_TIMEZONE = "Europe/Amsterdam";

/** Common IANA zones for shop onboarding/settings. Browser TZ is merged in at runtime. */
export const COMMON_SHOP_TIMEZONES = [
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Lisbon",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Atlantic/Canary",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Asia/Dubai",
] as const;

export function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    if (tz) return tz;
  } catch {
    /* ignore */
  }
  return DEFAULT_SHOP_TIMEZONE;
}

/** Options for a timezone <select>: common list + current value if missing. */
export function shopTimezoneSelectOptions(current?: string | null): string[] {
  const set = new Set<string>(COMMON_SHOP_TIMEZONES);
  const cur = (current ?? "").trim();
  if (cur) set.add(cur);
  return [...set].sort((a, b) => a.localeCompare(b));
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type CivilDayKey = (typeof DAY_KEYS)[number];

export function resolveShopTimezone(raw: string | null | undefined): string {
  const tz = (raw ?? "").trim();
  return tz || DEFAULT_SHOP_TIMEZONE;
}

function normalizeHhmm(hhmm: string): string {
  const [h = "0", m = "0"] = hhmm.trim().split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/** Gregorian Y-M-D → weekday key (timezone-independent for a civil date). */
export function dayKeyFromYmd(dateYmd: string): CivilDayKey {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  if (!y || !mo || !d) return "mon";
  // UTC noon avoids any DST edge when reading weekday of a civil date.
  return DAY_KEYS[new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).getUTCDay()];
}

/**
 * Interpret `dateYmd` + `hhmm` as wall clock in `shopTz`, return the UTC instant.
 * Example: shopLocalToUtc("2026-08-13", "09:30", "Europe/Amsterdam")
 */
export function shopLocalToUtc(
  dateYmd: string,
  hhmm: string,
  shopTz: string | null | undefined,
): Date {
  const tz = resolveShopTimezone(shopTz);
  return fromZonedTime(`${dateYmd}T${normalizeHhmm(hhmm)}:00`, tz);
}

export type ShopLocalParts = {
  dateYmd: string;
  timeHHmm: string;
  dayKey: CivilDayKey;
  minutesOfDay: number;
};

/** Convert a UTC instant into shop-local civil date / time parts. */
export function utcToShopLocal(utc: Date, shopTz: string | null | undefined): ShopLocalParts {
  const tz = resolveShopTimezone(shopTz);
  const dateYmd = formatInTimeZone(utc, tz, "yyyy-MM-dd");
  const timeHHmm = formatInTimeZone(utc, tz, "HH:mm");
  const [hh, mm] = timeHHmm.split(":").map(Number);
  return {
    dateYmd,
    timeHHmm,
    dayKey: dayKeyFromYmd(dateYmd),
    minutesOfDay: (hh || 0) * 60 + (mm || 0),
  };
}

/**
 * Inclusive UTC bounds for a shop-local calendar day — pass to availability RPCs
 * that filter with `starts_at >= rangeStart AND starts_at <= rangeEnd`.
 */
export function shopLocalDayBoundsUtc(
  dateYmd: string,
  shopTz: string | null | undefined,
): { rangeStart: Date; rangeEnd: Date } {
  const rangeStart = shopLocalToUtc(dateYmd, "00:00", shopTz);
  const [y, m, d] = dateYmd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextYmd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const nextMidnight = shopLocalToUtc(nextYmd, "00:00", shopTz);
  return { rangeStart, rangeEnd: new Date(nextMidnight.getTime() - 1) };
}

/** Today's civil date in the shop timezone (`yyyy-MM-dd`). */
export function shopTodayYmd(shopTz: string | null | undefined, now = new Date()): string {
  return formatInTimeZone(now, resolveShopTimezone(shopTz), "yyyy-MM-dd");
}

/** Format a UTC instant for display in shop local time. */
export function formatInShopTz(
  utc: Date,
  shopTz: string | null | undefined,
  formatStr: string,
): string {
  return formatInTimeZone(utc, resolveShopTimezone(shopTz), formatStr);
}

/** Extract `yyyy-MM-dd` from a react-day-picker Date (civil date the user clicked). */
export function civilDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
