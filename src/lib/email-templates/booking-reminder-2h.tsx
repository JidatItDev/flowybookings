import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface BookingReminder2hProps {
  customerName?: string
  shopName?: string
  serviceName?: string
  staffName?: string
  whenLabel?: string
  shopAddress?: string
  /** Google Maps (or vergelijkbare) route-link naar de shop. */
  routeUrl?: string
  logoUrl?: string
}

const BookingReminder2hEmail = ({
  customerName,
  shopName = 'FlowyBookings',
  serviceName,
  staffName,
  whenLabel,
  shopAddress,
  routeUrl,
  logoUrl,
}: BookingReminder2hProps) => {
  const mapsHref =
    routeUrl
    ?? (shopAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopAddress)}` : undefined)

  return (
    <Html lang="nl" dir="ltr">
      <Head />
      <Preview>{`Tot zo! Je afspraak bij ${shopName} is over 2 uur`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {logoUrl && (
            <Section style={logoWrap}>
              <Img src={logoUrl} alt={shopName} width="56" height="56" style={logoImg} />
            </Section>
          )}
          <Heading style={h1}>
            {customerName ? `Tot zo, ${customerName}!` : 'Tot zo!'}
          </Heading>
          <Text style={text}>
            Je afspraak bij <strong>{shopName}</strong> begint over ongeveer 2 uur.
          </Text>

          <Section style={card}>
            {serviceName && <Row label="Dienst" value={serviceName} />}
            {staffName && <Row label="Bij" value={staffName} />}
            {whenLabel && <Row label="Wanneer" value={whenLabel} />}
            {shopAddress && <Row label="Adres" value={shopAddress} />}
          </Section>

          {mapsHref && (
            <Section style={{ textAlign: 'center', margin: '0 0 24px' }}>
              <Button href={mapsHref} style={button}>Route plannen</Button>
            </Section>
          )}

          <Text style={footer}>{`Tot zo — het team van ${shopName}`}</Text>
        </Container>
      </Body>
    </Html>
  )
}

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
  component: BookingReminder2hEmail,
  subject: (d: Record<string, any>) =>
    `Tot zo! Je afspraak bij ${d?.shopName ?? 'ons'} is over 2 uur`,
  displayName: 'Boeking herinnering (2 uur)',
  previewData: {
    customerName: 'Sophie',
    shopName: 'Aurora Studio',
    serviceName: 'Knippen & stylen',
    staffName: 'Mia',
    whenLabel: 'vandaag · 14:30',
    shopAddress: 'Keizersgracht 123, Amsterdam',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const logoWrap = { margin: '0 0 20px' }
const logoImg = { borderRadius: '12px', objectFit: 'cover' as const, display: 'block' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 20px' }
const card = {
  backgroundColor: '#f6f4ff',
  borderRadius: '12px',
  padding: '18px 20px',
  margin: '0 0 24px',
}
const rowLabel = { fontSize: '13px', color: '#8a86a0', padding: '4px 0', width: '110px' }
const rowValue = { fontSize: '14px', color: '#1a1330', padding: '4px 0', fontWeight: 600 as const }
const button = {
  backgroundColor: '#5b4fff',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 600 as const,
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
