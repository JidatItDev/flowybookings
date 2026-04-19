import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface WelcomeShopOwnerProps {
  ownerName?: string
  shopName?: string
  trialDays?: number
  dashboardUrl?: string
}

const WelcomeShopOwnerEmail = ({
  ownerName,
  shopName = 'jouw zaak',
  trialDays = 14,
  dashboardUrl = 'https://www.flowybookings.com/shop',
}: WelcomeShopOwnerProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>{`Welkom bij FlowyBookings — je ${trialDays}-daagse proefperiode is gestart`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {ownerName ? `Welkom bij FlowyBookings, ${ownerName}!` : 'Welkom bij FlowyBookings!'}
        </Heading>
        <Text style={text}>
          Leuk dat <strong>{shopName}</strong> kiest voor FlowyBookings. Je account staat klaar
          en je <strong>{trialDays} dagen gratis proefperiode</strong> is zojuist gestart — geen
          creditcard nodig.
        </Text>

        <Section style={card}>
          <Text style={cardTitle}>In 3 stappen aan de slag</Text>
          <Text style={cardItem}>1. Voeg je diensten en prijzen toe</Text>
          <Text style={cardItem}>2. Stel je openingstijden &amp; team in</Text>
          <Text style={cardItem}>3. Deel je boekingslink met klanten</Text>
        </Section>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={dashboardUrl} style={button}>Open je dashboard</Button>
        </Section>

        <Text style={text}>
          Tijdens je proefperiode heb je toegang tot alle functies. Voor je proefperiode afloopt
          krijg je een herinnering en kun je in alle rust een plan kiezen.
        </Text>
        <Text style={text}>
          Vragen of hulp nodig? Antwoord gewoon op deze e-mail — we helpen je graag op weg.
        </Text>
        <Text style={footer}>Het FlowyBookings team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeShopOwnerEmail,
  subject: (d: Record<string, any>) =>
    d?.shopName
      ? `Welkom bij FlowyBookings — ${d.shopName} is live`
      : 'Welkom bij FlowyBookings',
  displayName: 'Welkom shop-eigenaar',
  previewData: {
    ownerName: 'Sophie',
    shopName: 'Aurora Studio',
    trialDays: 14,
    dashboardUrl: 'https://www.flowybookings.com/shop',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 16px' }
const card = {
  backgroundColor: '#f6f4ff',
  borderRadius: '12px',
  padding: '18px 20px',
  margin: '20px 0 4px',
}
const cardTitle = { fontSize: '13px', color: '#7c3aed', fontWeight: 700 as const, margin: '0 0 10px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const cardItem = { fontSize: '14px', color: '#1a1330', margin: '4px 0', lineHeight: '1.5' }
const button = {
  backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 28px',
  borderRadius: '10px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '14px',
  display: 'inline-block',
}
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
