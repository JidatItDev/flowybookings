// Internal helper: send a booking-related transactional email by enqueuing it
// directly via the service-role client. Used by:
//   - the public hooks/booking-confirmation route (anon caller, no JWT)
//   - the cron-driven hooks/booking-automations route (system caller)
//
// Mirrors the logic of the scaffolded /lovable/email/transactional/send route
// but skips JWT verification — callers must be trusted (server-to-server).

import * as React from 'react'
import { render } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'FlowyBookings'
const SENDER_DOMAIN = 'notify.flowybookings.com'
const FROM_DOMAIN = 'notify.flowybookings.com'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface EnqueueParams {
  templateName: string
  recipientEmail: string
  templateData?: Record<string, any>
  /** Stable key per booking + email kind so retries don't double-send. */
  idempotencyKey?: string
}

export type EnqueueResult =
  | { success: true; queued: true; messageId: string }
  | { success: false; reason: 'suppressed' | 'already_sent' | 'invalid_template' | 'no_recipient' }
  | { success: false; reason: 'error'; error: string }

export async function enqueueBookingEmail(
  params: EnqueueParams,
): Promise<EnqueueResult> {
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return { success: false, reason: 'error', error: 'Server not configured' }
  }

  const tpl = TEMPLATES[params.templateName]
  if (!tpl) return { success: false, reason: 'invalid_template' }

  const recipient = (tpl.to || params.recipientEmail || '').trim()
  if (!recipient) return { success: false, reason: 'no_recipient' }

  const supabase = createClient(supabaseUrl, serviceKey)
  const normalized = recipient.toLowerCase()
  const messageId = crypto.randomUUID()
  const idempotencyKey = params.idempotencyKey || messageId

  // Idempotency: skip if a non-failed log row already exists for this key.
  if (params.idempotencyKey) {
    const { data: existing } = await supabase
      .from('email_send_log')
      .select('id, status')
      .contains('metadata', { idempotency_key: params.idempotencyKey })
      .limit(1)
      .maybeSingle()
    if (existing && existing.status !== 'failed') {
      return { success: false, reason: 'already_sent' }
    }
  }

  // Suppression
  const { data: suppressed } = await supabase
    .from('suppressed_emails').select('id').eq('email', normalized).maybeSingle()
  if (suppressed) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: params.templateName,
      recipient_email: recipient,
      status: 'suppressed',
      metadata: { idempotency_key: idempotencyKey },
    })
    return { success: false, reason: 'suppressed' }
  }

  // Unsubscribe token (one per email)
  let unsubscribeToken: string
  const { data: existingToken } = await supabase
    .from('email_unsubscribe_tokens').select('token, used_at').eq('email', normalized).maybeSingle()
  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    unsubscribeToken = generateToken()
    await supabase.from('email_unsubscribe_tokens')
      .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: stored } = await supabase
      .from('email_unsubscribe_tokens').select('token').eq('email', normalized).maybeSingle()
    if (!stored) return { success: false, reason: 'error', error: 'Failed to store unsubscribe token' }
    unsubscribeToken = stored.token
  } else {
    return { success: false, reason: 'suppressed' }
  }

  // Render
  const data = params.templateData ?? {}
  const element = React.createElement(tpl.component, data)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject = typeof tpl.subject === 'function' ? tpl.subject(data) : tpl.subject

  // Log pending first
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: params.templateName,
    recipient_email: recipient,
    status: 'pending',
    metadata: { idempotency_key: idempotencyKey },
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: params.templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: params.templateName,
      recipient_email: recipient,
      status: 'failed',
      error_message: 'Failed to enqueue: ' + enqueueError.message,
      metadata: { idempotency_key: idempotencyKey },
    })
    return { success: false, reason: 'error', error: enqueueError.message }
  }

  return { success: true, queued: true, messageId }
}
