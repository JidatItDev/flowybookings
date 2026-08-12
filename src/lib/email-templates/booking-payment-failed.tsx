import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { getBookingUrl } from '@/lib/booking-url'

interface BookingPaymentFailedProps {
  customerName?: string
  shopName?: string
  serviceName?: string
  whenLabel?: string
  amountLabel?: string
  retryUrl?: string
}

const BookingPaymentFailedEmail = ({
  customerName,
  shopName = 'de salon',
  serviceName,
  whenLabel,
  amountLabel,
  retryUrl,
}: BookingPaymentFailedProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Je betaling is niet gelukt — probeer het opnieuw</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {customerName ? `Hoi ${customerName}, je betaling is niet gelukt` : 'Je betaling is niet gelukt'}
        </Heading>
        <Text style={text}>
          We konden je aanbetaling voor je afspraak bij <strong>{shopName}</strong> helaas niet
          verwerken. Je afspraak is daarom <strong>nog niet bevestigd</strong>.
        </Text>

        <Section style={card}>
          {serviceName && <Row label="Dienst" value={serviceName} />}
          {whenLabel && <Row label="Datum" value={whenLabel} />}
          {amountLabel && <Row label="Bedrag" value={amountLabel} />}
        </Section>

        {retryUrl && (
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={retryUrl} style={button}>Probeer opnieuw te betalen</Button>
          </Section>
        )}

        <Text style={text}>
          Lukt het niet? Antwoord op deze e-mail — dan helpen we je verder of kunnen we de
          afspraak handmatig vastleggen.
        </Text>
        <Text style={footer}>Het team van {shopName}</Text>
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
  component: BookingPaymentFailedEmail,
  subject: (d: Record<string, any>) =>
    d?.shopName
      ? `Betaling mislukt voor je afspraak bij ${d.shopName}`
      : 'Je betaling is niet gelukt',
  displayName: 'Boeking — betaling mislukt',
  previewData: {
    customerName: 'Sophie',
    shopName: 'Aurora Studio',
    serviceName: 'Knippen & stylen',
    whenLabel: 'vr 21 mrt · 14:30',
    amountLabel: '€10,00',
    retryUrl: getBookingUrl('aurora', { external: true }),
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 16px' }
const card = {
  backgroundColor: '#fef2f2',
  borderRadius: '12px',
  padding: '18px 20px',
  margin: '0 0 16px',
  borderLeft: '3px solid #ef4444',
}
const rowLabel = { fontSize: '13px', color: '#8a86a0', padding: '4px 0', width: '110px' }
const rowValue = { fontSize: '14px', color: '#1a1330', padding: '4px 0', fontWeight: 600 as const }
const button = {
  backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 28px',
  borderRadius: '10px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '14px',
  display: 'inline-block',
}
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
