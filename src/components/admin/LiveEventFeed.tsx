import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, Store } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/integrations/supabase/client"
import { adminEventFeedQuery, type AdminEvent } from "@/lib/admin-dashboard-extras"
import { relativeFromNow } from "@/lib/format"
import {
  ensureNotificationPermission,
  playChime,
  showBrowserNotification,
} from "@/lib/admin-alerts"
import { getSoundEnabled } from "@/lib/admin-sound-pref"

const ACTION_LABELS: Record<string, string> = {
  shop_plan_change: "Plan gewijzigd",
  shop_status_change: "Status gewijzigd",
  shop_subscription_change: "Abonnement gewijzigd",
  shop_cancelled: "Shop geannuleerd",
  payment_failed: "Betaling mislukt",
  mollie_connected: "Mollie gekoppeld",
  mollie_disconnected: "Mollie ontkoppeld",
  feature_override_set: "Feature override",
  feature_override_removed: "Override verwijderd",
  customers_imported: "Klanten geïmporteerd",
  subscription_payment_failed: "Abonnement-betaling mislukt",
}

// Acties die als kritiek gelden — admin krijgt direct een subtiele toast.
function isHighPriority(action: string, metadata: Record<string, unknown> | null): boolean {
  if (
    action === "payment_failed" ||
    action === "shop_cancelled" ||
    action === "subscription_payment_failed"
  )
    return true
  if (action === "shop_subscription_change") {
    const next = (metadata?.subscription_status ?? metadata?.status) as string | undefined
    return next === "cancelled" || next === "expired" || next === "payment_failed"
  }
  return false
}

function eventLabel(e: { action: string }): string {
  return ACTION_LABELS[e.action] ?? e.action.replace(/_/g, " ")
}

export function LiveEventFeed() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery(adminEventFeedQuery())

  // Vraag eenmalig permission voor browser-notificaties zodra de admin de feed opent.
  useEffect(() => {
    ensureNotificationPermission()
  }, [])

  // Realtime: nieuwe rij in activity_log → invalidate + toast/chime/notificatie bij hoge prioriteit
  useEffect(() => {
    const channel = supabase
      .channel("admin-activity-log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["admin", "event-feed"] })
          qc.invalidateQueries({ queryKey: ["admin", "unread-activity"] })

          const row = payload.new as {
            action?: string
            metadata?: Record<string, unknown> | null
          }
          if (row?.action && isHighPriority(row.action, row.metadata ?? null)) {
            const label = eventLabel({ action: row.action })
            const description = "Bekijk de activiteit-feed voor details."
            toast.warning(label, { description })
            if (getSoundEnabled()) playChime()
            showBrowserNotification(`FlowyBookings · ${label}`, description)
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold">Live activiteit</h2>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="max-h-96 divide-y divide-border overflow-y-auto">
        {isLoading && (
          <p className="px-6 py-6 text-sm text-muted-foreground">Activiteit laden…</p>
        )}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="px-6 py-6 text-sm text-muted-foreground">Nog geen activiteit.</p>
        )}
        {(data ?? []).map((e: AdminEvent) => (
          <div key={e.id} className="flex items-start gap-3 px-6 py-3 text-sm">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Store className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{eventLabel(e)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {e.shop_name ?? "—"}
                {e.actor_email ? ` · door ${e.actor_email}` : ""}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {relativeFromNow(e.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
