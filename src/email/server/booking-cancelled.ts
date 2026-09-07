// Sends the "booking cancelled" email. Caller: booking-status.ts, right after
// its own guarded status update actually flips pending/confirmed -> cancelled
// (a retried/duplicate request never sees that transition succeed twice, so
// this is naturally called at most once per real cancellation — the
// idempotencyKey below is a backstop, not the primary guard).
//
// Unlike booking-confirmation, this is NOT gated on shop_automations — there
// is no cancellation-email toggle, and a customer whose appointment vanished
// should always hear about it (see docs/adr/0001-cancellation-and-refund-are-independent.md
// for why this whole area is deliberately simple/manual in Phase 1).

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/email/send-email'
import { formatInShopTz, resolveShopTimezone } from '@/shared/lib/shop-timezone'

export type BookingCancelledResult =
  | { skipped: true; reason: string }
  | { error: string }
  | Awaited<ReturnType<typeof sendEmail>>

export async function sendBookingCancelledEmail(bookingId: string): Promise<BookingCancelledResult> {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return { error: 'Server not configured' }

  const supabase = createClient(url, serviceKey)

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, shop_id, status, starts_at, customer_id, service_id, price_cents, currency')
    .eq('id', bookingId)
    .maybeSingle()
  if (bErr || !booking) return { error: 'Booking not found' }
  if (booking.status !== 'cancelled') return { skipped: true, reason: 'not_cancelled' }

  const [{ data: customer }, { data: shop }, { data: service }] = await Promise.all([
    booking.customer_id
      ? supabase.from('customers').select('full_name, email').eq('id', booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('shops').select('name, timezone').eq('id', booking.shop_id).maybeSingle(),
    booking.service_id
      ? supabase.from('services').select('name').eq('id', booking.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!customer?.email) return { skipped: true, reason: 'no_email' }

  const startsAt = new Date(booking.starts_at)
  const shopTz = resolveShopTimezone((shop as { timezone?: string | null } | null)?.timezone)
  const whenLabel = formatInShopTz(startsAt, shopTz, 'EEE d MMM, HH:mm')

  return sendEmail({
    type: 'booking-cancelled',
    to: customer.email,
    idempotencyKey: `booking-cancel-${booking.id}`,
    data: {
      customerName: customer.full_name?.split(' ')[0] ?? '',
      shopName: shop?.name ?? '',
      serviceName: service?.name ?? '',
      whenLabel,
    },
  })
}
