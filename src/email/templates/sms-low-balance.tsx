import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface SmsLowBalanceProps {
  shopName?: string
  balance?: number
  topUpUrl?: string
}

const SmsLowBalanceEmail = ({
  shopName = 'jouw zaak',
  balance = 0,
  topUpUrl = 'https://www.flowybookings.com/shop/notifications?topup=open',
}: SmsLowBalanceProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Je SMS-saldo is bijna op</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Je SMS-saldo voor {shopName} is bijna op</Heading>
        <Text style={text}>
          Hoi! Je hebt nog <strong>{balance} SMS-credit{balance === 1 ? '' : 's'}</strong> over.
          Zodra het saldo op 0 staat, worden er geen SMS-herinneringen meer naar je klanten gestuurd.
        </Text>
        <Text style={text}>
          Vul nu je saldo aan zodat je klanten op tijd hun herinnering blijven ontvangen — vanaf €4 voor 100 credits.
        </Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={topUpUrl} style={button}>SMS-saldo bijvullen</Button>
        </Section>
        <Text style={text}>
          Tip: schakel SMS-herinneringen tijdelijk uit als je geen credits wilt bijkopen — je email-herinneringen blijven gewoon werken.
        </Text>
        <Text style={footer}>Het FlowyBookings team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SmsLowBalanceEmail,
  subject: (d: Record<string, any>) =>
    `Nog ${d?.balance ?? 0} SMS-credits — vul aan om herinneringen te blijven sturen`,
  displayName: 'SMS-saldo bijna op',
  previewData: {
    shopName: 'Aurora Studio',
    balance: 3,
    topUpUrl: 'https://www.flowybookings.com/shop/notifications?topup=open',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 24px',
  borderRadius: '10px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '14px',
}
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
