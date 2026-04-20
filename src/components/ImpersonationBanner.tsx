import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { ShieldAlert, ArrowLeft } from "lucide-react"
import {
  getImpersonation,
  stopImpersonate,
  subscribeImpersonation,
  type ImpersonationState,
} from "@/lib/impersonation"
import { useAuth } from "@/lib/auth-context"

/**
 * Rode read-only banner die bovenaan elke /shop-pagina verschijnt zodra
 * een super_admin "Login als [shop]" heeft gebruikt.
 */
export function ImpersonationBanner() {
  const { isSuperAdmin, user } = useAuth()
  const [state, setState] = useState<ImpersonationState | null>(() => getImpersonation())

  useEffect(() => subscribeImpersonation(() => setState(getImpersonation())), [])

  if (!isSuperAdmin || !state) return null

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-destructive/40 bg-destructive px-4 py-2 text-destructive-foreground sm:px-6">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>
          Je bekijkt als admin namens <strong>{state.shopName}</strong> · alleen-lezen
        </span>
      </div>
      <Link
        to="/beheer/dashboard/shops"
        onClick={() => stopImpersonate({ userId: user?.id ?? null, email: user?.email ?? null })}
        className="inline-flex items-center gap-1.5 rounded-lg bg-destructive-foreground/10 px-3 py-1 text-xs font-semibold hover:bg-destructive-foreground/20"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Terug naar admin
      </Link>
    </div>
  )
}

/** Hook: read-only mode actief? Componenten kunnen mutaties hierop disablen. */
export function useImpersonationReadOnly(): boolean {
  const { isSuperAdmin } = useAuth()
  const [state, setState] = useState<ImpersonationState | null>(() => getImpersonation())
  useEffect(() => subscribeImpersonation(() => setState(getImpersonation())), [])
  return isSuperAdmin && state != null
}

/**
 * Synchronous guard voor binnenin mutationFn — gooit als impersonate actief is,
 * zodat een muis-omzeiling van het disabled-attribute alsnog faalt.
 */
export function assertNotImpersonating(): void {
  const state = getImpersonation()
  if (state) {
    throw new Error("Alleen-lezen tijdens impersonate")
  }
}
