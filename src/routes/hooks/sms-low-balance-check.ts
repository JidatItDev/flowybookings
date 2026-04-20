// Cron-driven check: warns shop owners on two thresholds:
// - LOW (balance < 5 and > 0): "bijna op" reminder
// - ZERO (balance == 0): kritische waarschuwing dat SMS-herinneringen gepauzeerd zijn
// Runs hourly. Uses activity_log as idempotency: max 1 email per shop per UTC day per level.

import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { enqueueBookingEmail } from '@/lib/email/enqueue-booking-email'

const LOW_THRESHOLD = 5
const ACTION_LOW = 'sms_low_balance_warning_sent'
const ACTION_ZERO = 'sms_zero_balance_warning_sent'

type Level = 'low' | 'zero'

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
        const counters = {
          checked: 0,
          sent_low: 0,
          sent_zero: 0,
          skipped_already_sent: 0,
          skipped_no_email: 0,
          errors: 0,
        }

        const { data: lowBalanceShops, error } = await supabase
          .from('shop_sms_credits')
          .select('shop_id, balance')
          .lt('balance', LOW_THRESHOLD)
        if (error) {
          return Response.json({ error: error.message }, { status: 500 })
        }

        const todayUtc = new Date().toISOString().slice(0, 10)
        const startOfDay = `${todayUtc}T00:00:00Z`

        for (const row of lowBalanceShops ?? []) {
          counters.checked++
          const level: Level = row.balance <= 0 ? 'zero' : 'low'
          const action = level === 'zero' ? ACTION_ZERO : ACTION_LOW
          const templateName = level === 'zero' ? 'sms-zero-balance' : 'sms-low-balance'

          try {
            // Idempotency per level — prevents re-sending the same severity within one UTC day,
            // but allows escalating from "low" → "zero" on the same day if balance drops to 0.
            const { data: alreadySent } = await supabase
              .from('activity_log')
              .select('id')
              .eq('shop_id', row.shop_id)
              .eq('action', action)
              .gte('created_at', startOfDay)
              .limit(1)
              .maybeSingle()
            if (alreadySent) { counters.skipped_already_sent++; continue }

            const { data: shop } = await supabase
              .from('shops')
              .select('id, name, owner_id, email')
              .eq('id', row.shop_id)
              .maybeSingle()
            if (!shop) { counters.errors++; continue }

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

            const templateData =
              level === 'zero'
                ? {
                    shopName: shop.name,
                    topUpUrl: 'https://www.flowybookings.com/shop/notifications?topup=open',
                  }
                : {
                    shopName: shop.name,
                    balance: row.balance,
                    topUpUrl: 'https://www.flowybookings.com/shop/notifications?topup=open',
                  }

            const result = await enqueueBookingEmail({
              templateName,
              recipientEmail,
              idempotencyKey: `sms-${level}-${row.shop_id}-${todayUtc}`,
              templateData,
            })

            if (result.success || ('reason' in result && result.reason === 'already_sent')) {
              await supabase.from('activity_log').insert({
                shop_id: row.shop_id,
                action,
                entity: 'shop_sms_credits',
                metadata: { balance: row.balance, level, recipient: recipientEmail, date: todayUtc },
              })
              if (level === 'zero') counters.sent_zero++
              else counters.sent_low++
            } else {
              counters.errors++
            }
          } catch (err) {
            console.error('sms-balance check failed', { shop: row.shop_id, level, err })
            counters.errors++
          }
        }

        return Response.json({ ok: true, ranAt: new Date().toISOString(), ...counters })
      },
    },
  },
})
