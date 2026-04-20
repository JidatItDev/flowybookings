// Customer import helpers — parsing CSV / XLSX, column mapping, dedup.
// Used by the CustomerImportDialog component on /shop/customers.

import * as XLSX from "xlsx";

export type ImportSource =
  | "fresha"
  | "salonized"
  | "treatwell"
  | "simplybook"
  | "planity"
  | "csv"
  | "manual"
  | "booking_page";

export type ParsedRow = Record<string, string>;

export type ColumnMapping = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type ImportRow = {
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  _raw: ParsedRow;
};

export type DedupStrategy = "skip" | "merge";

export type ImportSummary = {
  inserted: number;
  updated: number;
  skipped: number;
  withoutEmail: number;
  errors: { row: number; reason: string }[];
};

/* ────────────── File parsing ────────────── */

export async function parseFile(file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return { headers: [], rows: [] };
  const sheet = wb.Sheets[firstSheet];
  const json = XLSX.utils.sheet_to_json<ParsedRow>(sheet, {
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (json.length === 0) return { headers: [], rows: [] };
  // Build a stable header set from the first row's keys (XLSX preserves column order).
  const headers = Object.keys(json[0]);
  // Coerce all cells to strings & trim
  const rows = json.map((r) => {
    const out: ParsedRow = {};
    for (const h of headers) {
      const v = r[h];
      out[h] = v == null ? "" : String(v).trim();
    }
    return out;
  });
  return { headers, rows };
}

/* ────────────── Column auto-detection ────────────── */

const NAME_HINTS = ["name", "full name", "fullname", "client", "customer", "naam", "klant", "voornaam"];
const EMAIL_HINTS = ["email", "e-mail", "mail", "emailadres"];
const PHONE_HINTS = ["phone", "mobile", "telephone", "tel", "telefoon", "gsm", "mobiel", "nummer"];
const NOTES_HINTS = ["notes", "note", "comment", "comments", "remark", "opmerking", "notitie", "notities"];

const PRESETS: Record<Exclude<ImportSource, "manual" | "booking_page" | "csv">, Partial<ColumnMapping>> = {
  fresha: { full_name: "Client name", email: "Email", phone: "Mobile number", notes: "Notes" },
  salonized: { full_name: "Naam", email: "E-mail", phone: "Telefoon", notes: "Opmerkingen" },
  treatwell: { full_name: "Customer name", email: "Email", phone: "Phone", notes: "Notes" },
  simplybook: { full_name: "Client name", email: "Client email", phone: "Client phone", notes: "Comments" },
  planity: { full_name: "Nom", email: "Email", phone: "Téléphone", notes: "Commentaires" },
};

function findHeader(headers: string[], hints: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  // Exact match first
  for (const hint of hints) {
    const idx = lower.indexOf(hint);
    if (idx !== -1) return headers[idx];
  }
  // Contains match
  for (let i = 0; i < lower.length; i++) {
    if (hints.some((h) => lower[i].includes(h))) return headers[i];
  }
  return null;
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  return {
    full_name: findHeader(headers, NAME_HINTS),
    email: findHeader(headers, EMAIL_HINTS),
    phone: findHeader(headers, PHONE_HINTS),
    notes: findHeader(headers, NOTES_HINTS),
  };
}

export function presetMapping(source: ImportSource, headers: string[]): ColumnMapping {
  const auto = autoDetectMapping(headers);
  if (source === "csv" || source === "manual" || source === "booking_page") return auto;
  const preset = PRESETS[source];
  // Only use preset header if the file actually contains that column, otherwise fall back to auto.
  const pick = (key: keyof ColumnMapping): string | null => {
    const want = preset[key];
    if (want && headers.includes(want)) return want;
    return auto[key];
  };
  return {
    full_name: pick("full_name"),
    email: pick("email"),
    phone: pick("phone"),
    notes: pick("notes"),
  };
}

/* ────────────── Row normalisation ────────────── */

export function applyMapping(rows: ParsedRow[], mapping: ColumnMapping): {
  valid: ImportRow[];
  invalid: { row: number; reason: string }[];
} {
  const valid: ImportRow[] = [];
  const invalid: { row: number; reason: string }[] = [];
  rows.forEach((r, idx) => {
    const name = mapping.full_name ? r[mapping.full_name]?.trim() : "";
    if (!name) {
      invalid.push({ row: idx + 2, reason: "missing name" }); // +2 = header row + 1-indexed
      return;
    }
    const email = mapping.email ? r[mapping.email]?.trim().toLowerCase() : "";
    const phone = mapping.phone ? r[mapping.phone]?.trim() : "";
    const notes = mapping.notes ? r[mapping.notes]?.trim() : "";
    valid.push({
      full_name: name,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
      _raw: r,
    });
  });
  return { valid, invalid };
}

/* ────────────── Source labels ────────────── */

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  fresha: "Fresha",
  salonized: "Salonized",
  treatwell: "Treatwell",
  simplybook: "SimplyBook",
  planity: "Planity",
  csv: "CSV",
  manual: "Handmatig",
  booking_page: "Boekingspagina",
};

export const PLATFORM_INSTRUCTIONS: Record<string, string> = {
  fresha:
    "Ga in Fresha naar Klanten → Exporteer → Download CSV. Upload het bestand hieronder.",
  salonized:
    "Ga in Salonized naar Klanten → Exporteer → CSV. Upload het bestand hieronder.",
  treatwell:
    "Ga in Treatwell Business naar Klantenlijst → Download. Upload het bestand hieronder.",
  simplybook:
    "Ga in SimplyBook naar Clients → Export → CSV. Upload het bestand hieronder.",
  planity:
    "Ga in Planity naar Clients → Exporter → CSV. Upload het bestand hieronder.",
};
