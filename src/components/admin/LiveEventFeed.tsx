import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, Store } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { adminEventFeedQuery, type AdminEvent } from "@/lib/admin-dashboard-extras"
import { relativeFromNow } from "@/lib/format"

const ACTION_LABELS: Record<string, string> = {
  shop_plan_change: "Plan gewijzigd",
  shop_status_change: "Status gewijzigd",
  mollie_connected: "Mollie gekoppeld",
  mollie_disconnected: "Mollie ontkoppeld",
  feature_override_set: "Feature override",
  feature_override_removed: "Override verwijderd",
}

function eventLabel(e: AdminEvent): string {
  return ACTION_LABELS[e.action] ?? e.action.replace(/_/g, " ")
}

export function LiveEventFeed() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery(adminEventFeedQuery())

  // Realtime: nieuwe rij in activity_log → invalidate
  useEffect(() => {
    const channel = supabase
      .channel("admin-activity-log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        () => qc.invalidateQueries({ queryKey: ["admin", "event-feed"] }),
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
        {(data ?? []).map((e) => (
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
