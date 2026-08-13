// Deterministic color per staff id for quick visual recognition,
// with optional per-shop manual override stored in shops.branding.staff_colors.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaletteKey =
  | "rose" | "amber" | "emerald" | "sky" | "violet"
  | "pink" | "teal" | "orange" | "indigo" | "lime";

export type StaffColor = {
  key: PaletteKey;
  bg: string;
  text: string;
  dot: string;
  // Solid swatch class for the picker preview.
  swatch: string;
  label: string;
};

const PALETTE: Record<PaletteKey, StaffColor> = {
  rose:    { key: "rose",    bg: "bg-rose-500/15",    text: "text-rose-600 dark:text-rose-300",       dot: "bg-rose-500/30",    swatch: "bg-rose-500",    label: "Roze" },
  amber:   { key: "amber",   bg: "bg-amber-500/15",   text: "text-amber-700 dark:text-amber-300",     dot: "bg-amber-500/30",   swatch: "bg-amber-500",   label: "Amber" },
  emerald: { key: "emerald", bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500/30", swatch: "bg-emerald-500", label: "Groen" },
  sky:     { key: "sky",     bg: "bg-sky-500/15",     text: "text-sky-700 dark:text-sky-300",         dot: "bg-sky-500/30",     swatch: "bg-sky-500",     label: "Lucht" },
  violet:  { key: "violet",  bg: "bg-violet-500/15",  text: "text-violet-700 dark:text-violet-300",   dot: "bg-violet-500/30",  swatch: "bg-violet-500",  label: "Paars" },
  pink:    { key: "pink",    bg: "bg-pink-500/15",    text: "text-pink-700 dark:text-pink-300",       dot: "bg-pink-500/30",    swatch: "bg-pink-500",    label: "Pink" },
  teal:    { key: "teal",    bg: "bg-teal-500/15",    text: "text-teal-700 dark:text-teal-300",       dot: "bg-teal-500/30",    swatch: "bg-teal-500",    label: "Teal" },
  orange:  { key: "orange",  bg: "bg-orange-500/15",  text: "text-orange-700 dark:text-orange-300",   dot: "bg-orange-500/30",  swatch: "bg-orange-500",  label: "Oranje" },
  indigo:  { key: "indigo",  bg: "bg-indigo-500/15",  text: "text-indigo-700 dark:text-indigo-300",   dot: "bg-indigo-500/30",  swatch: "bg-indigo-500",  label: "Indigo" },
  lime:    { key: "lime",    bg: "bg-lime-500/15",    text: "text-lime-700 dark:text-lime-300",       dot: "bg-lime-500/30",    swatch: "bg-lime-500",    label: "Lime" },
};

export const PALETTE_KEYS: PaletteKey[] = [
  "rose", "amber", "emerald", "sky", "violet", "pink", "teal", "orange", "indigo", "lime",
];

export const PALETTE_LIST: StaffColor[] = PALETTE_KEYS.map((k) => PALETTE[k]);

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function staffColorByKey(key: PaletteKey | null | undefined): StaffColor | null {
  if (!key) return null;
  return PALETTE[key] ?? null;
}

/** Deterministic auto-color (no override). Same id → same palette entry. */
export function staffColor(id: string | null | undefined): StaffColor {
  if (!id) return PALETTE.rose;
  return PALETTE_LIST[hashString(id) % PALETTE_LIST.length];
}

export function staffInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ---------- Per-shop overrides ----------

export const shopBrandingKeys = {
  branding: (shopId: string) => ["shop_branding", shopId] as const,
};

type BrandingRow = { branding: { staff_colors?: Record<string, PaletteKey> } | null };

export function useShopBranding(shopId: string | null | undefined) {
  return useQuery({
    queryKey: shopBrandingKeys.branding(shopId ?? ""),
    enabled: !!shopId,
    queryFn: async (): Promise<Record<string, PaletteKey>> => {
      const { data, error } = await supabase
        .from("shops")
        .select("branding")
        .eq("id", shopId!)
        .maybeSingle<BrandingRow>();
      if (error) throw error;
      const map = (data?.branding?.staff_colors ?? {}) as Record<string, PaletteKey>;
      // Filter unknown keys defensively.
      const clean: Record<string, PaletteKey> = {};
      for (const [k, v] of Object.entries(map)) {
        if (PALETTE_KEYS.includes(v as PaletteKey)) clean[k] = v as PaletteKey;
      }
      return clean;
    },
    staleTime: 60_000,
  });
}

/** Returns a resolver that respects manual overrides from shops.branding.staff_colors. */
export function useStaffColors(shopId: string | null | undefined) {
  const { data: overrides = {}, ...rest } = useShopBranding(shopId);
  const get = useMemo(
    () => (staffId: string | null | undefined): StaffColor => {
      if (!staffId) return PALETTE.rose;
      const override = overrides[staffId];
      if (override && PALETTE[override]) return PALETTE[override];
      return staffColor(staffId);
    },
    [overrides],
  );
  const overrideOf = (staffId: string): PaletteKey | null => overrides[staffId] ?? null;
  return { get, overrides, overrideOf, ...rest };
}
