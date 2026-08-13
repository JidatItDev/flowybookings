// Server function wrapper that triggers the daily expire-sweep route.
// Runs server-side so we can use SUPABASE_SERVICE_ROLE_KEY without exposing
// it to the client bundle.

import { createServerFn } from "@tanstack/react-start";

type SweepResult = {
  ok: boolean;
  checked: number;
  downgraded: number;
  results: Array<{ shop_id: string; previous_plan: string }>;
  ran_at: string;
};

export const runExpireSweep = createServerFn({ method: "POST" }).handler(
  async (): Promise<SweepResult> => {
    const token =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!token) {
      throw new Error("Missing Supabase service/anon key for expire-sweep auth");
    }

    // Resolve absolute URL from the incoming request when available.
    const { getRequest } = await import("@tanstack/react-start/server");
    let origin = "";
    try {
      const req = getRequest();
      origin = new URL(req.url).origin;
    } catch {
      origin = process.env.VITE_SUPABASE_URL ? "" : "";
    }

    const url = `${origin}/api/billing/expire-sweep`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Sweep failed (${res.status}): ${text || res.statusText}`);
    }

    return (await res.json()) as SweepResult;
  },
);
