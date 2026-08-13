import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

import { template as bookingConfirmation } from './booking-confirmation'
import { template as bookingReminder } from './booking-reminder'
import { template as bookingReminder2h } from './booking-reminder-2h'
import { template as bookingFollowup } from './booking-followup'
import { template as trialEnding } from './trial-ending'
import { template as welcomeShopOwner } from './welcome-shop-owner'
import { template as bookingPaymentFailed } from './booking-payment-failed'
import { template as platformPaymentFailed } from './platform-payment-failed'
import { template as smsLowBalance } from './sms-low-balance'
import { template as smsZeroBalance } from './sms-zero-balance'
import { template as smsTopupApplied } from './sms-topup-applied'

/**
 * Template registry — maps template names to their React Email components.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'booking-confirmation': bookingConfirmation,
  'booking-reminder': bookingReminder,
  'booking-reminder-2h': bookingReminder2h,
  'booking-followup': bookingFollowup,
  'trial-ending': trialEnding,
  'welcome-shop-owner': welcomeShopOwner,
  'booking-payment-failed': bookingPaymentFailed,
  'platform-payment-failed': platformPaymentFailed,
  'sms-low-balance': smsLowBalance,
  'sms-zero-balance': smsZeroBalance,
  'sms-topup-applied': smsTopupApplied,
}
