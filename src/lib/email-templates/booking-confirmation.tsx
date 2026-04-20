import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text,
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
  logoUrl?: string
}

const BookingConfirmationEmail = ({
  customerName,
  shopName = 'FlowyBookings',
  serviceName,
  staffName,
  whenLabel,
  priceLabel,
  shopAddress,
  logoUrl,
}: BookingConfirmationProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>{`Je afspraak bij ${shopName} is bevestigd`}</Preview>
    <Body style={main}>
      <Container style={container}>
        {logoUrl && (
          <Section style={logoWrap}>
            <Img src={logoUrl} alt={shopName} width="56" height="56" style={logoImg} />
          </Section>
        )}
        <Heading style={h1}>
          {customerName ? `Hoi ${customerName}, je afspraak is bevestigd` : 'Je afspraak is bevestigd'}
        </Heading>
        <Text style={text}>
          Bedankt voor je boeking bij <strong>{shopName}</strong>. We hebben je plekje vastgelegd —
          dit zijn de details:
        </Text>
        <Section style={card}>
          {serviceName && <Row label="Dienst" value={serviceName} />}
          {staffName && <Row label="Bij" value={staffName} />}
          {whenLabel && <Row label="Wanneer" value={whenLabel} />}
          {priceLabel && <Row label="Bedrag" value={priceLabel} />}
          {shopAddress && <Row label="Adres" value={shopAddress} />}
        </Section>
        <Text style={text}>
          We sturen je voor je afspraak nog een vriendelijke herinnering. Wil je verzetten of
          afzeggen? Antwoord gewoon op deze e-mail.
        </Text>
        <Text style={footer}>{`Tot dan! — het team van ${shopName}`}</Text>
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
    d?.shopName ? `Bevestiging — je afspraak bij ${d.shopName}` : 'Je afspraak is bevestigd',
  displayName: 'Boekingsbevestiging',
  previewData: {
    customerName: 'Sophie',
    shopName: 'Aurora Studio',
    serviceName: 'Knippen & stylen',
    staffName: 'Mia',
    whenLabel: 'vr 21 mrt · 14:30',
    priceLabel: '€45,00',
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
