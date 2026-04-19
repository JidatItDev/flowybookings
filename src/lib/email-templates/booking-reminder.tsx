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
  /** "morgen" of "over 2 uur" */
  windowLabel?: string
}

const BookingReminderEmail = ({
  customerName,
  shopName = 'FlowyBookings',
  serviceName,
  staffName,
  whenLabel,
  shopAddress,
  windowLabel = 'binnenkort',
}: BookingReminderProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>{`Herinnering: je afspraak bij ${shopName} is ${windowLabel}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {customerName
            ? `Hoi ${customerName}, tot ${windowLabel}!`
            : `Je afspraak is ${windowLabel}`}
        </Heading>
        <Text style={text}>
          Een korte herinnering aan je afspraak bij <strong>{shopName}</strong>:
        </Text>
        <Section style={card}>
          {serviceName && <Row label="Dienst" value={serviceName} />}
          {staffName && <Row label="Bij" value={staffName} />}
          {whenLabel && <Row label="Wanneer" value={whenLabel} />}
          {shopAddress && <Row label="Adres" value={shopAddress} />}
        </Section>
        <Text style={text}>
          Lukt het toch niet? Antwoord op deze e-mail dan vinden we samen een nieuw moment.
        </Text>
        <Text style={footer}>{`Tot ${windowLabel} — het team van ${shopName}`}</Text>
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
    `Herinnering: je afspraak bij ${d?.shopName ?? 'ons'} ${d?.windowLabel ?? 'binnenkort'}`.trim(),
  displayName: 'Boeking herinnering',
  previewData: {
    customerName: 'Sophie',
    shopName: 'Aurora Studio',
    serviceName: 'Knippen & stylen',
    staffName: 'Mia',
    whenLabel: 'vr 21 mrt · 14:30',
    shopAddress: 'Keizersgracht 123, Amsterdam',
    windowLabel: 'morgen',
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
