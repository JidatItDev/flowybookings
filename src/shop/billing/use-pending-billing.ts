// UI-only "activation in progress" flag.
//
// Why this exists: after a successful Mollie redirect there is a short window
// (usually <5s, sometimes longer) before the webhook flips shop.plan in the DB.
// Previously the UI polled queries 5× to bridge that gap, which was fragile.
//
// Instead we set a sessionStorage flag the moment the user starts checkout, and
// the UI shows an "Activatie loopt…" badge while the flag is set AND the DB
// plan still equals the previous trial/plan. The hook auto-clears the flag the
// moment the DB reflects a paid plan that matches what was requested.
//
// This is purely cosmetic — the DB remains the single source of truth. We just
// avoid showing "TRIAL" while the user is staring at the page waiting for the
// webhook.

import { useEffect, useState } from "react";
import { useAuth } from "@/auth/lib/auth-context";

const STORAGE_KEY = "fb.pendingBilling";
const MAX_AGE_MS = 5 * 60_000; // safety: never block UI longer than 5 minutes

export type PendingBilling = {
  shopId: string;
  plan: "starter" | "pro" | "premium";
  cycle: "monthly" | "yearly";
  startedAt: number;
};

function readFlag(): PendingBilling | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBilling;
    if (!parsed?.shopId || !parsed.plan || !parsed.startedAt) return null;
    if (Date.now() - parsed.startedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function markBillingPending(p: Omit<PendingBilling, "startedAt">) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...p, startedAt: Date.now() } satisfies PendingBilling),
    );
    // Notify same-tab listeners (storage event only fires across tabs).
    window.dispatchEvent(new Event("fb:pending-billing-changed"));
  } catch {
    /* ignore */
  }
}

export function clearBillingPending() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("fb:pending-billing-changed"));
  } catch {
    /* ignore */
  }
}

/**
 * Returns the current pending state. Auto-clears the flag the moment the DB
 * plan matches what was requested (so the badge disappears instantly when the
 * webhook lands and the auth-shops cache refetches).
 */
export function usePendingBilling(): PendingBilling | null {
  const { activeShop } = useAuth();
  const [flag, setFlag] = useState<PendingBilling | null>(() => readFlag());

  // React to flag changes (set by checkout, cleared by webhook arrival).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setFlag(readFlag());
    window.addEventListener("storage", sync);
    window.addEventListener("fb:pending-billing-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("fb:pending-billing-changed", sync);
    };
  }, []);

  // Auto-clear when DB has caught up.
  useEffect(() => {
    if (!flag || !activeShop) return;
    if (activeShop.id !== flag.shopId) return;
    if (activeShop.plan === flag.plan) {
      clearBillingPending();
    }
  }, [flag, activeShop]);

  return flag;
}
