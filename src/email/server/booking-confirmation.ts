// Sends the "booking confirmed" email. Two callers:
//   - PublicBookingFlow.tsx's public hooks/booking-confirmation route, for the
//     true no-deposit-needed instant-confirm path (anon caller, no JWT).
//   - connect-webhook.ts, in-process, right after it verifies a deposit
//     payment as paid via Mollie's API (the only place that actually knows
//     the payment succeeded).
// Idempotent via bookings.confirmation_sent_at AND sendEmail()'s own
// idempotencyKey — safe to call more than once for the same booking.

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/email/send-email'
import { formatInShopTz, resolveShopTimezone } from '@/shared/lib/shop-timezone'

export type BookingConfirmationResult =
  | { skipped: true; reason: string }
  | { error: string }
  | Awaited<ReturnType<typeof sendEmail>>

export async function sendBookingConfirmationEmail(bookingId: string): Promise<BookingConfirmationResult> {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return { error: 'Server not configured' }

  const supabase = createClient(url, serviceKey)

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, shop_id, starts_at, confirmation_sent_at, customer_id, service_id, staff_id, price_cents, currency')
    .eq('id', bookingId)
    .maybeSingle()
  if (bErr || !booking) return { error: 'Booking not found' }
  if (booking.confirmation_sent_at) return { skipped: true, reason: 'already_sent' }

  const { data: auto } = await supabase
    .from('shop_automations').select('confirmation_enabled').eq('shop_id', booking.shop_id).maybeSingle()
  if (auto && auto.confirmation_enabled === false) return { skipped: true, reason: 'disabled' }

  const [{ data: customer }, { data: shop }, { data: service }, { data: staff }] = await Promise.all([
    booking.customer_id
      ? supabase.from('customers').select('full_name, email').eq('id', booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('shops').select('name, address, timezone').eq('id', booking.shop_id).maybeSingle(),
    booking.service_id
      ? supabase.from('services').select('name').eq('id', booking.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
    booking.staff_id
      ? supabase.from('staff').select('full_name').eq('id', booking.staff_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!customer?.email) return { skipped: true, reason: 'no_email' }

  const startsAt = new Date(booking.starts_at)
  const shopTz = resolveShopTimezone((shop as { timezone?: string | null } | null)?.timezone)
  const whenLabel = formatInShopTz(startsAt, shopTz, 'EEE d MMM, HH:mm')
  const priceLabel = `${(booking.currency || 'EUR') === 'EUR' ? '€' : (booking.currency + ' ')}${(booking.price_cents / 100).toFixed(2)}`

  const result = await sendEmail({
    type: 'booking-confirmation',
    to: customer.email,
    idempotencyKey: `booking-confirm-${booking.id}`,
    data: {
      customerName: customer.full_name?.split(' ')[0] ?? '',
      shopName: shop?.name ?? '',
      serviceName: service?.name ?? '',
      staffName: staff?.full_name ?? '',
      whenLabel,
      priceLabel,
      shopAddress: shop?.address ?? '',
    },
  })

  if (result.success) {
    await supabase.from('bookings').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', booking.id)
  }
  return result
}

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    let bookingId: string
    try {
      const body = await request.json()
      bookingId = body?.bookingId
      if (!bookingId || typeof bookingId !== 'string') {
        return Response.json({ error: 'bookingId required' }, { status: 400 })
      }
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const result = await sendBookingConfirmationEmail(bookingId)
    if ('error' in result) {
      return Response.json(result, { status: result.error === 'Booking not found' ? 404 : 500 })
    }
    return Response.json(result)
  },
}
