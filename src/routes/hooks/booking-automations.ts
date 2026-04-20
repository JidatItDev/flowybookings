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
          .select('shop_id, reminder_24h_enabled, reminder_2h_enabled, reminder_sms_enabled, followup_enabled, followup_delay_minutes')
        if (aErr) {
          return Response.json({ error: aErr.message }, { status: 500 })
        }

        const smsCounters = { sent: 0, skipped_no_credits: 0, skipped_no_phone: 0, errors: 0 }

        for (const auto of automations ?? []) {
          // ---- 24h reminder ----
          if (auto.reminder_24h_enabled) {
            const target = new Date(now.getTime() + 24 * 60 * 60 * 1000)
            const lo = new Date(target.getTime() - WINDOW_MIN * 60 * 1000)
            const hi = new Date(target.getTime() + WINDOW_MIN * 60 * 1000)
            const sent = await sendForWindow(supabase, auto.shop_id, lo, hi, 'reminder-24h', counters)
            counters.reminder24h += sent
          }

          // ---- 2h reminder (email + optional SMS) ----
          if (auto.reminder_2h_enabled) {
            const target = new Date(now.getTime() + 2 * 60 * 60 * 1000)
            const lo = new Date(target.getTime() - WINDOW_MIN * 60 * 1000)
            const hi = new Date(target.getTime() + WINDOW_MIN * 60 * 1000)
            const sent = await sendForWindow(supabase, auto.shop_id, lo, hi, 'reminder-2h', counters)
            counters.reminder2h += sent

            // Reminder-SMS — runs alongside the email reminder window
            if (auto.reminder_sms_enabled) {
              await sendReminderSmsWindow(supabase, auto.shop_id, lo, hi, smsCounters)
            }
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

        return Response.json({ ok: true, ranAt: now.toISOString(), ...counters, sms: smsCounters })
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
      logoUrl: ctx.logoUrl,
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
    supabase.from('shops').select('name, address, logo_url').eq('id', b.shop_id).maybeSingle(),
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
    logoUrl: (shop?.logo_url as string | null) ?? undefined,
    serviceName: service?.name as string | undefined,
    staffName: staff?.full_name as string | undefined,
    whenLabel: startsAt.toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }),
  }
}

// ============================================================
// SMS reminder window — verbruikt 1 credit per verzending.
// Provider-call is een TODO-stub; logt naar sms_send_log.
// Zodra Twilio (of andere provider) gekoppeld is: vervang sendSmsViaProvider().
// ============================================================
async function sendReminderSmsWindow(
  supabase: any,
  shopId: string,
  lo: Date, hi: Date,
  counters: { sent: number; skipped_no_credits: number; skipped_no_phone: number; errors: number },
): Promise<void> {
  // Pre-check: als saldo 0 is, pauzeer SMS-verzending voor deze shop.
  // We loggen per booking één 'skipped_no_credits' regel zodat we later
  // kunnen meten hoeveel SMS-herinneringen gemist zijn door leeg saldo.
  const { data: creditsRow } = await supabase
    .from('shop_sms_credits')
    .select('balance')
    .eq('shop_id', shopId)
    .maybeSingle()
  const balance = (creditsRow?.balance as number | undefined) ?? 0
  const paused = balance <= 0

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, shop_id, starts_at, customer_id, service_id, staff_id, status')
    .eq('shop_id', shopId)
    .in('status', ['pending', 'confirmed'])
    .gte('starts_at', lo.toISOString())
    .lte('starts_at', hi.toISOString())
    .limit(50)
  if (error) { counters.errors++; return }

  if (paused) {
    for (const b of bookings ?? []) {
      // Sla over als we al een sent/skipped-no-credits regel hebben voor deze booking
      const { data: existing } = await supabase
        .from('sms_send_log')
        .select('id, status')
        .eq('booking_id', b.id)
        .eq('template', 'reminder')
        .in('status', ['sent', 'skipped_no_credits'])
        .maybeSingle()
      if (existing) continue

      const ctx = await loadSmsContext(supabase, b)
      await supabase.from('sms_send_log').insert({
        shop_id: shopId,
        booking_id: b.id,
        customer_id: b.customer_id,
        phone: ctx?.phone ?? '',
        message: '',
        template: 'reminder',
        status: 'skipped_no_credits',
        error_message: 'SMS-herinneringen gepauzeerd: saldo is 0',
        credits_used: 0,
      })
      counters.skipped_no_credits++
    }
    return
  }

  for (const b of bookings ?? []) {
    try {
      // Idempotency: skip if we already logged a sent SMS for this booking
      const { data: existing } = await supabase
        .from('sms_send_log')
        .select('id')
        .eq('booking_id', b.id)
        .eq('template', 'reminder')
        .eq('status', 'sent')
        .maybeSingle()
      if (existing) continue

      const ctx = await loadSmsContext(supabase, b)
      if (!ctx?.phone) {
        await supabase.from('sms_send_log').insert({
          shop_id: shopId, booking_id: b.id, customer_id: b.customer_id,
          phone: '', message: '', template: 'reminder', status: 'skipped_no_phone',
        })
        counters.skipped_no_phone++
        continue
      }

      const message = buildReminderSms(ctx)

      // Try to consume a credit atomically
      const { data: consumed, error: cErr } = await supabase.rpc('consume_sms_credit', { _shop_id: shopId })
      if (cErr || !consumed) {
        await supabase.from('sms_send_log').insert({
          shop_id: shopId, booking_id: b.id, customer_id: b.customer_id,
          phone: ctx.phone, message, template: 'reminder', status: 'skipped_no_credits',
        })
        counters.skipped_no_credits++
        continue
      }

      // TODO(provider): vervang door echte SMS-call (Twilio etc.)
      const result = await sendSmsViaProvider(ctx.phone, message)

      if (result.ok) {
        await supabase.from('sms_send_log').insert({
          shop_id: shopId, booking_id: b.id, customer_id: b.customer_id,
          phone: ctx.phone, message, template: 'reminder', status: 'sent',
          provider: result.provider, provider_message_id: result.messageId, credits_used: 1,
        })
        counters.sent++
      } else {
        await supabase.from('sms_send_log').insert({
          shop_id: shopId, booking_id: b.id, customer_id: b.customer_id,
          phone: ctx.phone, message, template: 'reminder', status: 'failed',
          provider: result.provider, error_message: result.error, credits_used: 0,
        })
        counters.errors++
      }
    } catch (err) {
      console.error('reminder-sms failed', { booking: b.id, err })
      counters.errors++
    }
  }
}

async function loadSmsContext(supabase: any, b: any) {
  const [{ data: customer }, { data: shop }, { data: service }] = await Promise.all([
    b.customer_id
      ? supabase.from('customers').select('full_name, phone').eq('id', b.customer_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from('shops').select('name').eq('id', b.shop_id).maybeSingle(),
    b.service_id
      ? supabase.from('services').select('name').eq('id', b.service_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ])
  const startsAt = new Date(b.starts_at)
  return {
    phone: (customer?.phone as string | null) ?? null,
    firstName: (customer?.full_name as string | null)?.split(' ')[0] ?? '',
    shopName: (shop?.name as string | undefined) ?? 'FlowyBookings',
    serviceName: (service?.name as string | undefined) ?? '',
    whenLabel: startsAt.toLocaleString('nl-NL', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }),
  }
}

function buildReminderSms(ctx: { firstName: string; shopName: string; serviceName: string; whenLabel: string }): string {
  const greeting = ctx.firstName ? `Hi ${ctx.firstName}` : 'Hi'
  return `${greeting}, herinnering: ${ctx.serviceName ? ctx.serviceName + ' ' : ''}om ${ctx.whenLabel} bij ${ctx.shopName}. Tot zo!`
}

// =============================================================
// PROVIDER STUB — vervang dit met echte Twilio/MessageBird-call.
// Voor nu: log + return ok zodat de flow werkt zonder credentials.
// =============================================================
async function sendSmsViaProvider(
  phone: string,
  message: string,
): Promise<{ ok: true; provider: string; messageId: string } | { ok: false; provider: string; error: string }> {
  // TODO: Wire to Twilio (or MessageBird/Spryng).
  // const accountSid = process.env.TWILIO_ACCOUNT_SID
  // const authToken  = process.env.TWILIO_AUTH_TOKEN
  // const fromNumber = process.env.TWILIO_FROM_NUMBER
  // const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
  //   method: 'POST',
  //   headers: { Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`), 'Content-Type': 'application/x-www-form-urlencoded' },
  //   body: new URLSearchParams({ To: phone, From: fromNumber!, Body: message }),
  // })
  // const json = await res.json()
  // return res.ok ? { ok: true, provider: 'twilio', messageId: json.sid } : { ok: false, provider: 'twilio', error: json.message }

  console.info('[sms-stub] would send SMS', { phone, message })
  return { ok: true, provider: 'stub', messageId: `stub-${Date.now()}` }
}
