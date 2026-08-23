import { serverEnv } from "@/server/env";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCtx = Record<string, unknown>;

export type Logger = {
  debug: (msg: string, ctx?: LogCtx) => void;
  info: (msg: string, ctx?: LogCtx) => void;
  warn: (msg: string, ctx?: LogCtx) => void;
  error: (msg: string, ctx?: LogCtx) => void;
  child: (extra: LogCtx) => Logger;
};

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEY = /authorization|access[_-]?token|accesstoken|api[_-]?key|apikey|webhook[_-]?secret|webhooksecret|bearer|password|secret/i;

function activeLevel(): LogLevel {
  const raw = (serverEnv("LOG_LEVEL") ?? "").trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return serverEnv("NODE_ENV") === "production" ? "info" : "debug";
}

function useJson(): boolean {
  const fmt = (serverEnv("LOG_FORMAT") ?? "").trim().toLowerCase();
  if (fmt === "json") return true;
  if (fmt === "pretty") return false;
  return serverEnv("NODE_ENV") === "production";
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Error) &&
    !(v instanceof Date)
  );
}

function sanitizeValue(v: unknown): unknown {
  if (v instanceof Error) return { message: v.message, name: v.name };
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (isPlainRecord(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = sanitizeValue(val);
    }
    return out;
  }
  return v;
}

function sanitize(ctx: LogCtx | undefined): LogCtx {
  if (!ctx) return {};
  const out: LogCtx = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (SECRET_KEY.test(k)) continue;
    if (v instanceof Error) {
      out[k] = v.message;
      out[`${k}_name`] = v.name;
      continue;
    }
    out[k] = sanitizeValue(v);
  }
  return out;
}

function emit(level: LogLevel, scope: string, msg: string, ctx: LogCtx | undefined) {
  if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel()]) return;
  const safe = sanitize(ctx);
  const ts = new Date().toISOString();
  if (useJson()) {
    const line = JSON.stringify({ ...safe, ts, level, scope, msg });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }
  const bits = Object.entries(safe).map(([k, v]) => {
    if (v === null || v === undefined) return `${k}=`;
    if (typeof v === "object") return `${k}=${JSON.stringify(v)}`;
    return `${k}=${String(v)}`;
  });
  const line = bits.length
    ? `[${scope}] ${level} ${msg} ${bits.join(" ")}`
    : `[${scope}] ${level} ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string, bound: LogCtx = {}): Logger {
  const merge = (ctx?: LogCtx): LogCtx => ({ ...bound, ...sanitize(ctx) });
  return {
    debug: (msg, ctx) => emit("debug", scope, msg, merge(ctx)),
    info: (msg, ctx) => emit("info", scope, msg, merge(ctx)),
    warn: (msg, ctx) => emit("warn", scope, msg, merge(ctx)),
    error: (msg, ctx) => emit("error", scope, msg, merge(ctx)),
    child: (extra) => createLogger(scope, merge(extra)),
  };
}
