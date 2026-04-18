// Cron-driven automation: 24h reminder, 2h reminder, follow-up.
// Scanned every 5 minutes by pg_cron via /hooks/booking-automations.
//
// For each enabled shop we look at confirmed/pending bookings whose
// trigger window matches "now" (with a small lookback to absorb cron jitter),
// then enqueue the email and mark the corresponding *_sent_at column.

import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { enqueueBookingEmail } from '@/lib/email/enqueue-booking-email'

// Window tolerance — must comfortably exceed the cron interval (5 min).
const WINDOW_MIN = 7

export const Route = createFileRoute('/hooks/booking-automations')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !serviceKey) {
          return Response.json({ error: 'Server not configured' }, { status: 500 })
        }

        // Light auth: require Bearer header (cron passes anon key)
        const auth = request.headers.get('authorization')
        if (!auth?.startsWith('Bearer ')) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createClient(url, serviceKey)
        const now = new Date()
        const counters = { reminder24h: 0, reminder2h: 0, followup: 0, skipped: 0, errors: 0 }

        // 1. Pull all shops with their automation rows
        const { data: automations, error: aErr } = await supabase
          .from('shop_automations')
          .select('shop_id, reminder_24h_enabled, reminder_2h_enabled, followup_enabled, followup_delay_minutes')
        if (aErr) {
          return Response.json({ error: aErr.message }, { status: 500 })
        }

        for (const auto of automations ?? []) {
          // ---- 24h reminder ----
          if (auto.reminder_24h_enabled) {
            const target = new Date(now.getTime() + 24 * 60 * 60 * 1000)
            const lo = new Date(target.getTime() - WINDOW_MIN * 60 * 1000)
            const hi = new Date(target.getTime() + WINDOW_MIN * 60 * 1000)
            const sent = await sendForWindow(supabase, auto.shop_id, lo, hi, 'reminder-24h', counters)
            counters.reminder24h += sent
          }

          // ---- 2h reminder ----
          if (auto.reminder_2h_enabled) {
            const target = new Date(now.getTime() + 2 * 60 * 60 * 1000)
            const lo = new Date(target.getTime() - WINDOW_MIN * 60 * 1000)
            const hi = new Date(target.getTime() + WINDOW_MIN * 60 * 1000)
            const sent = await sendForWindow(supabase, auto.shop_id, lo, hi, 'reminder-2h', counters)
            counters.reminder2h += sent
          }

          // ---- Follow-up (X minutes after appointment ENDS) ----
          if (auto.followup_enabled) {
            const delay = auto.followup_delay_minutes ?? 120
            const targetEnd = new Date(now.getTime() - delay * 60 * 1000)
            const lo = new Date(targetEnd.getTime() - WINDOW_MIN * 60 * 1000)
            const hi = new Date(targetEnd.getTime() + WINDOW_MIN * 60 * 1000)
            const sent = await sendFollowupWindow(supabase, auto.shop_id, lo, hi, counters)
            counters.followup += sent
          }
        }

        return Response.json({ ok: true, ranAt: now.toISOString(), ...counters })
      },
    },
  },
})

type Kind = 'reminder-24h' | 'reminder-2h'

async function sendForWindow(
  supabase: any,
  shopId: string,
  lo: Date, hi: Date,
  kind: Kind,
  counters: { errors: number; skipped: number },
): Promise<number> {
  const sentColumn = kind === 'reminder-24h' ? 'reminder_24h_sent_at' : 'reminder_2h_sent_at'
  const windowLabel = kind === 'reminder-24h' ? 'tomorrow' : 'in 2 hours'

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, shop_id, starts_at, customer_id, service_id, staff_id, status')
    .eq('shop_id', shopId)
    .in('status', ['pending', 'confirmed'])
    .gte('starts_at', lo.toISOString())
    .lte('starts_at', hi.toISOString())
    .is(sentColumn, null)
    .limit(50)
  if (error) { counters.errors++; return 0 }

  let count = 0
  for (const b of bookings ?? []) {
    try {
      const ok = await sendReminder(supabase, b, kind, windowLabel)
      if (ok === 'sent') {
        await supabase.from('bookings').update({ [sentColumn]: new Date().toISOString() }).eq('id', b.id)
        count++
      } else {
        counters.skipped++
      }
    } catch (err) {
      console.error('reminder send failed', { booking: b.id, kind, err })
      counters.errors++
    }
  }
  return count
}

async function sendReminder(
  supabase: any,
  b: any,
  kind: Kind,
  windowLabel: string,
): Promise<'sent' | 'skipped'> {
  const ctx = await loadContext(supabase, b)
  if (!ctx) return 'skipped'
  const result = await enqueueBookingEmail({
    templateName: 'booking-reminder',
    recipientEmail: ctx.email,
    idempotencyKey: `${kind}-${b.id}`,
    templateData: {
      customerName: ctx.firstName,
      shopName: ctx.shopName,
      serviceName: ctx.serviceName,
      staffName: ctx.staffName,
      whenLabel: ctx.whenLabel,
      shopAddress: ctx.shopAddress,
      windowLabel,
    },
  })
  return result.success || ('reason' in result && result.reason === 'already_sent') ? 'sent' : 'skipped'
}

async function sendFollowupWindow(
  supabase: any,
  shopId: string,
  lo: Date, hi: Date,
  counters: { errors: number; skipped: number },
): Promise<number> {
  // Follow-up triggers based on appointment END, only for completed bookings.
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, shop_id, starts_at, ends_at, customer_id, service_id, staff_id, status')
    .eq('shop_id', shopId)
    .in('status', ['confirmed', 'completed'])
    .gte('ends_at', lo.toISOString())
    .lte('ends_at', hi.toISOString())
    .is('followup_sent_at', null)
    .limit(50)
  if (error) { counters.errors++; return 0 }

  let count = 0
  for (const b of bookings ?? []) {
    try {
      const ctx = await loadContext(supabase, b)
      if (!ctx) { counters.skipped++; continue }
      const result = await enqueueBookingEmail({
        templateName: 'booking-followup',
        recipientEmail: ctx.email,
        idempotencyKey: `followup-${b.id}`,
        templateData: {
          customerName: ctx.firstName,
          shopName: ctx.shopName,
          serviceName: ctx.serviceName,
        },
      })
      if (result.success || ('reason' in result && result.reason === 'already_sent')) {
        await supabase.from('bookings').update({ followup_sent_at: new Date().toISOString() }).eq('id', b.id)
        count++
      } else {
        counters.skipped++
      }
    } catch (err) {
      console.error('followup send failed', { booking: b.id, err })
      counters.errors++
    }
  }
  return count
}

async function loadContext(supabase: any, b: any) {
  const [{ data: customer }, { data: shop }, { data: service }, { data: staff }] = await Promise.all([
    b.customer_id
      ? supabase.from('customers').select('full_name, email').eq('id', b.customer_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from('shops').select('name, address').eq('id', b.shop_id).maybeSingle(),
    b.service_id
      ? supabase.from('services').select('name').eq('id', b.service_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    b.staff_id
      ? supabase.from('staff').select('full_name').eq('id', b.staff_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ])
  if (!customer?.email) return null
  const startsAt = new Date(b.starts_at)
  return {
    email: customer.email as string,
    firstName: (customer.full_name as string | null)?.split(' ')[0],
    shopName: shop?.name as string | undefined,
    shopAddress: shop?.address as string | undefined,
    serviceName: service?.name as string | undefined,
    staffName: staff?.full_name as string | undefined,
    whenLabel: startsAt.toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }),
  }
}
