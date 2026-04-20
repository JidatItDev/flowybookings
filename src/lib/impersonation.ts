// Lichte impersonate-helper voor super_admins.
// Slaat in sessionStorage op welke shop de admin "bekijkt als". De shop-views
// blijven gewoon werken via de bestaande activeShopId; deze flag voegt alleen
// een rode banner + read-only modus toe.
//
// Niet-admins kunnen dit niet activeren: de UI-knop staat alleen op
// /beheer/dashboard/shops (RequireSuperAdmin) en RLS blokkeert de rest.

const KEY = "flowybookings:impersonating-shop"

export type ImpersonationState = {
  shopId: string
  shopName: string
  startedAt: string
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

// Wrap so callers krijgen automatisch de event-dispatch
const _start = startImpersonation
const _stop = stopImpersonation
export const startImpersonate: typeof startImpersonation = (s) => {
  _start(s)
  dispatchChange()
}
export const stopImpersonate: typeof stopImpersonation = () => {
  _stop()
  dispatchChange()
}
