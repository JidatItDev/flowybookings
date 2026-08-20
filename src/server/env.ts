// Server-only env. Do NOT prefix secrets with VITE_ — Vite inlines VITE_* into the browser.
// Local `vite dev` does not copy non-VITE_ keys into process.env; we read .env ourselves.
// Cloudflare/wrangler uses process.env from secrets / .dev.vars.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let cached: Record<string, string> | null = null;

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDotEnvFiles(): Record<string, string> {
  if (cached) return cached;
  cached = {};
  if (typeof process === "undefined" || !process.versions?.node) return cached;
  const cwd = process.cwd();
  for (const name of [".dev.vars", ".env.local", ".env"]) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;
    Object.assign(cached, parseEnvFile(readFileSync(path, "utf8")));
  }
  return cached;
}

export function serverEnv(name: string): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env[name] : undefined;
  if (fromProcess) return fromProcess;
  return loadDotEnvFiles()[name];
}

/** Every distinct value for a key across process.env and env files (unmerged). */
export function collectServerEnvValues(name: string): string[] {
  const seen = new Set<string>();
  const add = (v?: string) => {
    const t = v?.trim();
    if (t) seen.add(t);
  };
  if (typeof process !== "undefined" && process.versions?.node) {
    const cwd = process.cwd();
    for (const file of [".dev.vars", ".env.local", ".env"]) {
      const path = resolve(cwd, file);
      if (!existsSync(path)) continue;
      add(parseEnvFile(readFileSync(path, "utf8"))[name]);
    }
  }
  add(typeof process !== "undefined" ? process.env[name] : undefined);
  return [...seen];
}
