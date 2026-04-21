// Deterministic color per staff id for quick visual recognition.
// Returns Tailwind classes for background, text, and the inner avatar dot.
// Pure function — same id always yields the same palette entry.

const PALETTE = [
  { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-300", dot: "bg-rose-500/30" },
  { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500/30" },
  { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500/30" },
  { bg: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-300", dot: "bg-sky-500/30" },
  { bg: "bg-violet-500/15", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500/30" },
  { bg: "bg-pink-500/15", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500/30" },
  { bg: "bg-teal-500/15", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500/30" },
  { bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500/30" },
  { bg: "bg-indigo-500/15", text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500/30" },
  { bg: "bg-lime-500/15", text: "text-lime-700 dark:text-lime-300", dot: "bg-lime-500/30" },
] as const;

export type StaffColor = (typeof PALETTE)[number];

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function staffColor(id: string | null | undefined): StaffColor {
  if (!id) return PALETTE[0];
  return PALETTE[hashString(id) % PALETTE.length];
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
