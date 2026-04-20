// Best-effort client-side helper voor activity_log inserts.
// Logged events worden opgepikt door admin LiveEventFeed (realtime).
import { supabase } from "@/integrations/supabase/client"

type LogActivityArgs = {
  entity: string
  action: string
  shopId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Schrijf een rij naar activity_log. Faalt nooit hard — admin-events mogen
 * de user-flow niet breken. RLS staat shop_owner inserts toe (zie
 * activity_log_insert policy).
 */
export async function logActivity(args: LogActivityArgs): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await supabase.from("activity_log").insert({
      entity: args.entity,
      action: args.action,
      shop_id: args.shopId ?? null,
      actor_user_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      metadata: args.metadata ?? {},
    })
  } catch {
    // ignore — logging mag nooit de hoofdactie blokkeren
  }
}
