// Hook called once per shop creation (typically from a DB trigger via pg_net,
// but also safe to invoke manually with { shopId }). Sends the welcome
// transactional email to the shop owner. Idempotent: uses a stable
// idempotency key per shop so retries never double-send.

import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { enqueueBookingEmail } from '@/email/enqueue-booking-email'

const TRIAL_DAYS = 14

export const handlers = {
      POST: async ({ request }: { request: Request }) => {
        // Light auth: bearer header (cron / DB-trigger passes anon key).
        const auth = request.headers.get('authorization')
        if (!auth?.startsWith('Bearer ')) {
          return json({ error: 'Unauthorized' }, 401)
        }

        let shopId: string
        try {
          const body = await request.json()
          shopId = body?.shopId ?? body?.shop_id
          if (!shopId || typeof shopId !== 'string') {
            return json({ error: 'shopId required' }, 400)
          }
        } catch {
          return json({ error: 'Invalid JSON' }, 400)
        }

        const { data: shop, error: shopErr } = await supabaseAdmin
          .from('shops')
          .select('id, name, owner_id, email')
          .eq('id', shopId)
          .maybeSingle()
        if (shopErr || !shop) {
          return json({ error: 'shop_not_found' }, 404)
        }

        // Resolve recipient: prefer shop.email, else owner profile email.
        let recipient = (shop.email ?? '').trim()
        let ownerName: string | undefined
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('email, full_name')
          .eq('id', shop.owner_id)
          .maybeSingle()
        if (!recipient) recipient = (profile?.email ?? '').trim()
        ownerName = profile?.full_name?.split(' ')[0] || undefined

        if (!recipient) {
          return json({ skipped: true, reason: 'no_recipient' })
        }

        const appUrl = process.env.APP_URL ?? 'https://www.flowybookings.com'

        const result = await enqueueBookingEmail({
          templateName: 'welcome-shop-owner',
          recipientEmail: recipient,
          idempotencyKey: `welcome-shop-${shop.id}`,
          templateData: {
            ownerName,
            shopName: shop.name,
            trialDays: TRIAL_DAYS,
            dashboardUrl: `${appUrl}/shop`,
          },
        })

        return json({ ok: true, result })
      },
    };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
