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
import { template as bookingFollowup } from './booking-followup'
import { template as trialEnding } from './trial-ending'

/**
 * Template registry — maps template names to their React Email components.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'booking-confirmation': bookingConfirmation,
  'booking-reminder': bookingReminder,
  'booking-followup': bookingFollowup,
  'trial-ending': trialEnding,
}
