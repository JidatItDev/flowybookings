import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface SmsTopupAppliedProps {
  shopName?: string
  credits?: number
  newBalance?: number
  resumed?: boolean
  dashboardUrl?: string
}

const SmsTopupAppliedEmail = ({
  shopName = 'jouw zaak',
  credits = 0,
  newBalance = 0,
  resumed = false,
  dashboardUrl = 'https://www.flowybookings.com/shop/notifications',
}: SmsTopupAppliedProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>{resumed ? 'SMS-herinneringen zijn weer actief' : 'Je SMS-saldo is bijgewerkt'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={successBanner}>
          <Text style={successText}>✅ Saldo bijgewerkt</Text>
        </Section>
        <Heading style={h1}>
          {credits} SMS-credits toegevoegd aan {shopName}
        </Heading>
        <Text style={text}>
          Je betaling is succesvol verwerkt en <strong>{credits} credits</strong> zijn aan je saldo toegevoegd.
          Je nieuwe saldo is <strong>{newBalance} credits</strong>.
        </Text>
        {resumed && (
          <Section style={resumedBanner}>
            <Text style={resumedText}>
              🔔 SMS-herinneringen zijn nu weer <strong>actief</strong>. Je klanten ontvangen vanaf nu opnieuw automatische SMS-herinneringen voor hun afspraken.
            </Text>
          </Section>
        )}
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={dashboardUrl} style={button}>Bekijk je saldo</Button>
        </Section>
        <Text style={text}>
          Bedankt voor je vertrouwen — we sturen je een waarschuwing zodra je saldo onder de 5 credits zakt.
        </Text>
        <Text style={footer}>Het FlowyBookings team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SmsTopupAppliedEmail,
  subject: (d: Record<string, any>) =>
    d?.resumed
      ? `✅ SMS-herinneringen weer actief voor ${d?.shopName ?? 'je zaak'}`
      : `✅ ${d?.credits ?? 0} SMS-credits toegevoegd aan ${d?.shopName ?? 'je zaak'}`,
  displayName: 'SMS-saldo bijgevuld',
  previewData: {
    shopName: 'Aurora Studio',
    credits: 100,
    newBalance: 100,
    resumed: true,
    dashboardUrl: 'https://www.flowybookings.com/shop/notifications',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const successBanner = {
  backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0',
  borderRadius: '10px', padding: '12px 16px', margin: '0 0 20px',
}
const successText = { fontSize: '14px', color: '#047857', fontWeight: 600 as const, margin: 0 }
const resumedBanner = {
  backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
  borderRadius: '10px', padding: '14px 18px', margin: '20px 0',
}
const resumedText = { fontSize: '14px', color: '#1e40af', lineHeight: '1.5', margin: 0 }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 24px',
  borderRadius: '10px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '14px',
}
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
