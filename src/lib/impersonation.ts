// Lichte impersonate-helper voor super_admins.
// Slaat in sessionStorage op welke shop de admin "bekijkt als". De shop-views
// blijven gewoon werken via de bestaande activeShopId; deze flag voegt alleen
// een rode banner + read-only modus toe.
//
// Niet-admins kunnen dit niet activeren: de UI-knop staat alleen op
// /beheer/dashboard/shops (RequireSuperAdmin) en RLS blokkeert de rest.

import { supabase } from "@/integrations/supabase/client"

const KEY = "flowybookings:impersonating-shop"

export type ImpersonationState = {
  shopId: string
  shopName: string
  startedAt: string
}

export type ImpersonationActor = {
  userId: string | null
  email: string | null
}

export function startImpersonation(state: Omit<ImpersonationState, "startedAt">) {
  if (typeof window === "undefined") return
  const payload: ImpersonationState = { ...state, startedAt: new Date().toISOString() }
  window.sessionStorage.setItem(KEY, JSON.stringify(payload))
}

export function stopImpersonation() {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(KEY)
}

export function getImpersonation(): ImpersonationState | null {
  if (typeof window === "undefined") return null
  const raw = window.sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ImpersonationState
  } catch {
    return null
  }
}

/** React-vriendelijk: subscribe op storage-events zodat banner direct reageert. */
export function subscribeImpersonation(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb()
  }
  // sessionStorage triggert geen 'storage' event in dezelfde tab — daarom
  // ook luisteren naar een custom event dat we zelf dispatchen.
  const customHandler = () => cb()
  window.addEventListener("storage", handler)
  window.addEventListener("flowy:impersonation-changed", customHandler)
  return () => {
    window.removeEventListener("storage", handler)
    window.removeEventListener("flowy:impersonation-changed", customHandler)
  }
}

function dispatchChange() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event("flowy:impersonation-changed"))
}

async function logImpersonationEvent(
  action: "admin_impersonate_start" | "admin_impersonate_stop",
  shopId: string,
  shopName: string,
  actor: ImpersonationActor,
) {
  try {
    await supabase.from("activity_log").insert({
      action,
      entity: "shop",
      shop_id: shopId,
      actor_user_id: actor.userId,
      actor_email: actor.email,
      metadata: { shop_name: shopName },
    })
  } catch (err) {
    // Audit-log mag de impersonate-flow nooit breken.
    console.warn("Failed to log impersonation event", err)
  }
}

/**
 * Start impersonate + log audit event. Geeft actor mee zodat we weten welke
 * super_admin de actie uitvoerde.
 */
export const startImpersonate = (
  state: Omit<ImpersonationState, "startedAt">,
  actor: ImpersonationActor = { userId: null, email: null },
) => {
  startImpersonation(state)
  dispatchChange()
  void logImpersonationEvent("admin_impersonate_start", state.shopId, state.shopName, actor)
}

/**
 * Stop impersonate + log audit event. Leest huidige state vóór clear zodat we
 * shop_id mee kunnen sturen.
 */
export const stopImpersonate = (
  actor: ImpersonationActor = { userId: null, email: null },
) => {
  const current = getImpersonation()
  stopImpersonation()
  dispatchChange()
  if (current) {
    void logImpersonationEvent(
      "admin_impersonate_stop",
      current.shopId,
      current.shopName,
      actor,
    )
  }
}
