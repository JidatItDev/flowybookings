// Public hook called from the booking flow right after a booking is created.
// Sends the booking-confirmation email if the shop has confirmation_enabled.
// No JWT required — this is invoked by anon users on /book.

import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { enqueueBookingEmail } from '@/lib/email/enqueue-booking-email'

export const Route = createFileRoute('/hooks/booking-confirmation')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !serviceKey) {
          return Response.json({ error: 'Server not configured' }, { status: 500 })
        }

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

        const supabase = createClient(url, serviceKey)

        const { data: booking, error: bErr } = await supabase
          .from('bookings')
          .select('id, shop_id, starts_at, confirmation_sent_at, customer_id, service_id, staff_id, price_cents, currency')
          .eq('id', bookingId)
          .maybeSingle()
        if (bErr || !booking) {
          return Response.json({ error: 'Booking not found' }, { status: 404 })
        }
        if (booking.confirmation_sent_at) {
          return Response.json({ skipped: true, reason: 'already_sent' })
        }

        // Check shop automation toggle
        const { data: auto } = await supabase
          .from('shop_automations').select('confirmation_enabled').eq('shop_id', booking.shop_id).maybeSingle()
        if (auto && auto.confirmation_enabled === false) {
          return Response.json({ skipped: true, reason: 'disabled' })
        }

        // Resolve customer + shop + service + staff
        const [{ data: customer }, { data: shop }, { data: service }, { data: staff }] = await Promise.all([
          booking.customer_id
            ? supabase.from('customers').select('full_name, email').eq('id', booking.customer_id).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from('shops').select('name, address').eq('id', booking.shop_id).maybeSingle(),
          booking.service_id
            ? supabase.from('services').select('name').eq('id', booking.service_id).maybeSingle()
            : Promise.resolve({ data: null }),
          booking.staff_id
            ? supabase.from('staff').select('full_name').eq('id', booking.staff_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ])

        if (!customer?.email) {
          return Response.json({ skipped: true, reason: 'no_email' })
        }

        const startsAt = new Date(booking.starts_at)
        const whenLabel = startsAt.toLocaleString('en-GB', {
          weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })
        const priceLabel = `${(booking.currency || 'EUR') === 'EUR' ? '€' : (booking.currency + ' ')}${(booking.price_cents / 100).toFixed(2)}`

        const result = await enqueueBookingEmail({
          templateName: 'booking-confirmation',
          recipientEmail: customer.email,
          idempotencyKey: `booking-confirm-${booking.id}`,
          templateData: {
            customerName: customer.full_name?.split(' ')[0],
            shopName: shop?.name,
            serviceName: service?.name,
            staffName: staff?.full_name,
            whenLabel,
            priceLabel,
            shopAddress: shop?.address,
          },
        })

        if (result.success) {
          await supabase.from('bookings')
            .update({ confirmation_sent_at: new Date().toISOString() })
            .eq('id', booking.id)
        }

        return Response.json(result)
      },
    },
  },
})
