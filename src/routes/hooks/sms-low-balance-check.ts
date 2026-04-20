// Cron-driven check: warns shop owners when SMS balance drops below 5 credits.
// Runs hourly. Uses activity_log as idempotency: max 1 email per shop per UTC day.

import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { enqueueBookingEmail } from '@/lib/email/enqueue-booking-email'

const THRESHOLD = 5
const ACTION = 'sms_low_balance_warning_sent'

export const Route = createFileRoute('/hooks/sms-low-balance-check')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !serviceKey) {
          return Response.json({ error: 'Server not configured' }, { status: 500 })
        }
        const auth = request.headers.get('authorization')
        if (!auth?.startsWith('Bearer ')) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createClient(url, serviceKey)
        const counters = { checked: 0, sent: 0, skipped_already_sent: 0, skipped_no_email: 0, errors: 0 }

        // Find all shops with low SMS balance
        const { data: lowBalanceShops, error } = await supabase
          .from('shop_sms_credits')
          .select('shop_id, balance')
          .lt('balance', THRESHOLD)
        if (error) {
          return Response.json({ error: error.message }, { status: 500 })
        }

        const todayUtc = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

        for (const row of lowBalanceShops ?? []) {
          counters.checked++
          try {
            // Idempotency: check if we already sent today (UTC)
            const startOfDay = `${todayUtc}T00:00:00Z`
            const { data: alreadySent } = await supabase
              .from('activity_log')
              .select('id')
              .eq('shop_id', row.shop_id)
              .eq('action', ACTION)
              .gte('created_at', startOfDay)
              .limit(1)
              .maybeSingle()
            if (alreadySent) { counters.skipped_already_sent++; continue }

            // Find shop owner email
            const { data: shop } = await supabase
              .from('shops')
              .select('id, name, owner_id, email')
              .eq('id', row.shop_id)
              .maybeSingle()
            if (!shop) { counters.errors++; continue }

            // Prefer profile email of owner; fall back to shop email
            let recipientEmail: string | null = shop.email
            if (shop.owner_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', shop.owner_id)
                .maybeSingle()
              if (profile?.email) recipientEmail = profile.email
            }
            if (!recipientEmail) { counters.skipped_no_email++; continue }

            const result = await enqueueBookingEmail({
              templateName: 'sms-low-balance',
              recipientEmail,
              idempotencyKey: `sms-low-${row.shop_id}-${todayUtc}`,
              templateData: {
                shopName: shop.name,
                balance: row.balance,
                topUpUrl: 'https://www.flowybookings.com/shop/notifications?topup=open',
              },
            })

            if (result.success || ('reason' in result && result.reason === 'already_sent')) {
              // Log to activity_log so we don't re-send today
              await supabase.from('activity_log').insert({
                shop_id: row.shop_id,
                action: ACTION,
                entity: 'shop_sms_credits',
                metadata: { balance: row.balance, recipient: recipientEmail, date: todayUtc },
              })
              counters.sent++
            } else {
              counters.errors++
            }
          } catch (err) {
            console.error('sms-low-balance check failed', { shop: row.shop_id, err })
            counters.errors++
          }
        }

        return Response.json({ ok: true, ranAt: new Date().toISOString(), ...counters })
      },
    },
  },
})
