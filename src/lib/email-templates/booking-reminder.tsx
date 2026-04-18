import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface BookingReminderProps {
  customerName?: string
  shopName?: string
  serviceName?: string
  staffName?: string
  whenLabel?: string
  shopAddress?: string
  windowLabel?: string // e.g. "tomorrow" or "in 2 hours"
}

const BookingReminderEmail = ({
  customerName,
  shopName = 'FlowyBookings',
  serviceName,
  staffName,
  whenLabel,
  shopAddress,
  windowLabel = 'soon',
}: BookingReminderProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reminder: your appointment at {shopName} is {windowLabel}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {customerName ? `Hi ${customerName}, see you ${windowLabel}!` : `Your appointment is ${windowLabel}`}
        </Heading>
        <Text style={text}>
          A quick reminder of your upcoming visit at <strong>{shopName}</strong>:
        </Text>
        <Section style={card}>
          {serviceName && <Row label="Service" value={serviceName} />}
          {staffName && <Row label="With" value={staffName} />}
          {whenLabel && <Row label="When" value={whenLabel} />}
          {shopAddress && <Row label="Address" value={shopAddress} />}
        </Section>
        <Text style={text}>
          Need to reschedule? Just reply to this email and we'll sort it out.
        </Text>
        <Text style={footer}>See you {windowLabel} — the {shopName} team</Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', margin: '6px 0' }}>
    <tbody>
      <tr>
        <td style={rowLabel}>{label}</td>
        <td style={rowValue}>{value}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: BookingReminderEmail,
  subject: (d: Record<string, any>) =>
    `Reminder: your ${d?.shopName ?? ''} appointment ${d?.windowLabel ?? 'soon'}`.replace(/\s+/g, ' ').trim(),
  displayName: 'Booking reminder',
  previewData: {
    customerName: 'Sophia',
    shopName: 'Aurora Studio',
    serviceName: 'Haircut & Style',
    staffName: 'Mia',
    whenLabel: 'Fri 21 Mar · 14:30',
    shopAddress: 'Keizersgracht 123, Amsterdam',
    windowLabel: 'tomorrow',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 20px' }
const card = {
  backgroundColor: '#f6f4ff',
  borderRadius: '12px',
  padding: '18px 20px',
  margin: '0 0 24px',
}
const rowLabel = { fontSize: '13px', color: '#8a86a0', padding: '4px 0', width: '110px' }
const rowValue = { fontSize: '14px', color: '#1a1330', padding: '4px 0', fontWeight: 600 as const }
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
