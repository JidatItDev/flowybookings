import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface BookingFollowupProps {
  customerName?: string
  shopName?: string
  serviceName?: string
}

const BookingFollowupEmail = ({
  customerName,
  shopName = 'FlowyBookings',
  serviceName,
}: BookingFollowupProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Thanks for visiting {shopName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {customerName ? `Thanks, ${customerName}!` : 'Thanks for stopping by!'}
        </Heading>
        <Text style={text}>
          We hope you enjoyed your{serviceName ? ` ${serviceName}` : ''} at <strong>{shopName}</strong>.
          It was a pleasure having you in.
        </Text>
        <Text style={text}>
          Ready to book again? Just reply to this email and we'll set it up — or pick a new slot online whenever it suits you.
        </Text>
        <Text style={footer}>See you next time — the {shopName} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingFollowupEmail,
  subject: (d: Record<string, any>) => `Thanks for visiting ${d?.shopName ?? 'us'}`,
  displayName: 'Booking follow-up',
  previewData: {
    customerName: 'Sophia',
    shopName: 'Aurora Studio',
    serviceName: 'Haircut & Style',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 20px' }
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
