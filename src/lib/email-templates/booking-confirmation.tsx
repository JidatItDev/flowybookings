import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface BookingConfirmationProps {
  customerName?: string
  shopName?: string
  serviceName?: string
  staffName?: string
  whenLabel?: string
  priceLabel?: string
  shopAddress?: string
}

const BookingConfirmationEmail = ({
  customerName,
  shopName = 'FlowyBookings',
  serviceName,
  staffName,
  whenLabel,
  priceLabel,
  shopAddress,
}: BookingConfirmationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your booking at {shopName} is confirmed</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {customerName ? `Hi ${customerName}, your booking is confirmed` : 'Your booking is confirmed'}
        </Heading>
        <Text style={text}>
          Thanks for booking with <strong>{shopName}</strong>. We've reserved your spot — here are the details:
        </Text>
        <Section style={card}>
          {serviceName && <Row label="Service" value={serviceName} />}
          {staffName && <Row label="With" value={staffName} />}
          {whenLabel && <Row label="When" value={whenLabel} />}
          {priceLabel && <Row label="Total" value={priceLabel} />}
          {shopAddress && <Row label="Address" value={shopAddress} />}
        </Section>
        <Text style={text}>
          We'll send a friendly reminder before your appointment. If you need to reschedule or cancel, just reply to this email.
        </Text>
        <Text style={footer}>See you soon — the {shopName} team</Text>
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
  component: BookingConfirmationEmail,
  subject: (d: Record<string, any>) =>
    d?.shopName ? `Your booking at ${d.shopName} is confirmed` : 'Your booking is confirmed',
  displayName: 'Booking confirmation',
  previewData: {
    customerName: 'Sophia',
    shopName: 'Aurora Studio',
    serviceName: 'Haircut & Style',
    staffName: 'Mia',
    whenLabel: 'Fri 21 Mar · 14:30',
    priceLabel: '€45.00',
    shopAddress: 'Keizersgracht 123, Amsterdam',
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
