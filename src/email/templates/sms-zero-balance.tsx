import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface SmsZeroBalanceProps {
  shopName?: string
  topUpUrl?: string
}

const SmsZeroBalanceEmail = ({
  shopName = 'jouw zaak',
  topUpUrl = 'https://www.flowybookings.com/shop/notifications?topup=open',
}: SmsZeroBalanceProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>SMS-herinneringen zijn gepauzeerd — saldo is op</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={alertBanner}>
          <Text style={alertText}>⚠️ SMS-herinneringen zijn gepauzeerd</Text>
        </Section>
        <Heading style={h1}>Je SMS-saldo voor {shopName} is op</Heading>
        <Text style={text}>
          Je SMS-tegoed staat op <strong>0 credits</strong>. Vanaf nu worden er
          <strong> geen SMS-herinneringen meer naar je klanten gestuurd</strong> totdat je je saldo bijvult.
        </Text>
        <Text style={text}>
          Je email-herinneringen blijven gewoon werken — alleen de SMS-kanalen zijn nu uitgeschakeld.
          Dit kan leiden tot meer no-shows als je klanten gewend zijn aan SMS.
        </Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={topUpUrl} style={button}>SMS-saldo bijvullen</Button>
        </Section>
        <Text style={text}>
          Vanaf €4 voor 100 credits ben je weer in de lucht. De SMS-herinneringen worden automatisch
          hervat zodra je betaling is verwerkt.
        </Text>
        <Text style={footer}>Het FlowyBookings team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SmsZeroBalanceEmail,
  subject: (d: Record<string, any>) =>
    `🚨 SMS-herinneringen gepauzeerd voor ${d?.shopName ?? 'je zaak'} — saldo is op`,
  displayName: 'SMS-saldo op (kritisch)',
  previewData: {
    shopName: 'Aurora Studio',
    topUpUrl: 'https://www.flowybookings.com/shop/notifications?topup=open',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const alertBanner = {
  backgroundColor: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: '10px', padding: '12px 16px', margin: '0 0 20px',
}
const alertText = { fontSize: '14px', color: '#b91c1c', fontWeight: 600 as const, margin: 0 }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#dc2626', color: '#ffffff', padding: '12px 24px',
  borderRadius: '10px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '14px',
}
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
