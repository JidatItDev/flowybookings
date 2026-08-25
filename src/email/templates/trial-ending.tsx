import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface TrialEndingProps {
  shopName?: string
  daysLeft?: number
  upgradeUrl?: string
}

const TrialEndingEmail = ({
  shopName = 'jouw zaak',
  daysLeft = 4,
  upgradeUrl = 'https://www.flowybookings.com/shop/billing',
}: TrialEndingProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Je gratis proefperiode verloopt binnenkort</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Je proefperiode verloopt over {daysLeft} dagen</Heading>
        <Text style={text}>
          Hoi! Je gratis proefperiode van FlowyBookings voor <strong>{shopName}</strong> loopt over {daysLeft} dagen af.
        </Text>
        <Text style={text}>
          Kies nu een plan om je boekingen, klanten en betalingen zonder onderbreking te blijven beheren.
          Vanaf €19/maand — op elk moment opzegbaar.
        </Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={upgradeUrl} style={button}>Bekijk plannen</Button>
        </Section>
        <Text style={text}>
          Vragen? Antwoord gewoon op deze e-mail — we helpen je graag.
        </Text>
        <Text style={footer}>Het FlowyBookings team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TrialEndingEmail,
  subject: (d: Record<string, any>) =>
    `Nog ${d?.daysLeft ?? 4} dagen — kies een FlowyBookings-plan`,
  displayName: 'Trial verloopt binnenkort',
  previewData: {
    shopName: 'Aurora Studio',
    daysLeft: 4,
    upgradeUrl: 'https://www.flowybookings.com/shop/billing',
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
