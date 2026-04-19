import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface PlatformPaymentFailedProps {
  shopName?: string
  planLabel?: string
  amountLabel?: string
  retryUrl?: string
}

const PlatformPaymentFailedEmail = ({
  shopName = 'jouw zaak',
  planLabel = 'jouw abonnement',
  amountLabel,
  retryUrl = 'https://www.flowybookings.com/shop/settings',
}: PlatformPaymentFailedProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>We konden je FlowyBookings-abonnement niet incasseren</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Betaling van je abonnement mislukt</Heading>
        <Text style={text}>
          De automatische incasso voor <strong>{planLabel}</strong> van <strong>{shopName}</strong>
          is helaas mislukt{amountLabel ? ` (${amountLabel})` : ''}.
        </Text>
        <Text style={text}>
          Je account blijft voorlopig actief, maar werk je betaalmethode binnen enkele dagen bij
          om onderbreking van je boekingen, herinneringen en betalingen te voorkomen.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={retryUrl} style={button}>Betaalmethode bijwerken</Button>
        </Section>

        <Text style={text}>
          Vragen over deze betaling? Antwoord op deze e-mail — we helpen je graag.
        </Text>
        <Text style={footer}>Het FlowyBookings team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PlatformPaymentFailedEmail,
  subject: (d: Record<string, any>) =>
    `Betaling abonnement mislukt — ${d?.shopName ?? 'FlowyBookings'}`,
  displayName: 'Platform — betaling mislukt',
  previewData: {
    shopName: 'Aurora Studio',
    planLabel: 'Pro plan (maandelijks)',
    amountLabel: '€49,00',
    retryUrl: 'https://www.flowybookings.com/shop/settings',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 28px',
  borderRadius: '10px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '14px',
  display: 'inline-block',
}
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
