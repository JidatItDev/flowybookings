// Sends the "booking rescheduled" email. Caller: reschedule.ts, right after
// its own guarded update actually moves starts_at. `oldStartsAtIso` must be
// captured by the caller BEFORE the update runs — by the time this function
// reads the booking, only the new time is in the DB.
//
// Not gated on shop_automations (no reschedule-email toggle exists) and only
// ever called when starts_at actually changed — a resize-only or
// staff-only-reassignment reschedule never reaches this (see CONTEXT.md's
// "Reschedule" entry).

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/email/send-email'
import { formatInShopTz, resolveShopTimezone } from '@/shared/lib/shop-timezone'

export type BookingRescheduledResult =
  | { skipped: true; reason: string }
  | { error: string }
  | Awaited<ReturnType<typeof sendEmail>>

export async function sendBookingRescheduledEmail(
  bookingId: string,
  oldStartsAtIso: string,
): Promise<BookingRescheduledResult> {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return { error: 'Server not configured' }

  const supabase = createClient(url, serviceKey)

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, shop_id, status, starts_at, customer_id, service_id, staff_id')
    .eq('id', bookingId)
    .maybeSingle()
  if (bErr || !booking) return { error: 'Booking not found' }
  if (booking.status === 'cancelled') return { skipped: true, reason: 'cancelled' }

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

  const shopTz = resolveShopTimezone((shop as { timezone?: string | null } | null)?.timezone)
  const oldWhenLabel = formatInShopTz(new Date(oldStartsAtIso), shopTz, 'EEE d MMM, HH:mm')
  const whenLabel = formatInShopTz(new Date(booking.starts_at), shopTz, 'EEE d MMM, HH:mm')

  return sendEmail({
    type: 'booking-rescheduled',
    to: customer.email,
    idempotencyKey: `booking-reschedule-${booking.id}-${booking.starts_at}`,
    data: {
      customerName: customer.full_name?.split(' ')[0] ?? '',
      shopName: shop?.name ?? '',
      serviceName: service?.name ?? '',
      staffName: staff?.full_name ?? '',
      oldWhenLabel,
      whenLabel,
      shopAddress: shop?.address ?? '',
    },
  })
}
