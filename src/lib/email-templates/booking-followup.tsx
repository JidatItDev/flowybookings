import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface BookingFollowupProps {
  customerName?: string
  shopName?: string
  serviceName?: string
}

const BookingFollowupEmail = ({
  customerName,
  shopName = 'FlowyBookings',
  serviceName,
}: BookingFollowupProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>{`Bedankt voor je bezoek aan ${shopName}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {customerName ? `Bedankt, ${customerName}!` : 'Bedankt voor je bezoek!'}
        </Heading>
        <Text style={text}>
          We hopen dat je{serviceName ? ` ${serviceName}` : ''} bij <strong>{shopName}</strong>
          bevallen is. Het was leuk je te zien.
        </Text>
        <Text style={text}>
          Klaar voor je volgende afspraak? Antwoord op deze e-mail of boek online een nieuw moment
          dat jou uitkomt.
        </Text>
        <Text style={footer}>{`Tot snel — het team van ${shopName}`}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingFollowupEmail,
  subject: (d: Record<string, any>) => `Bedankt voor je bezoek aan ${d?.shopName ?? 'ons'}`,
  displayName: 'Boeking follow-up',
  previewData: {
    customerName: 'Sophie',
    shopName: 'Aurora Studio',
    serviceName: 'Knippen & stylen',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a1330', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#4a4660', lineHeight: '1.6', margin: '0 0 20px' }
const footer = { fontSize: '13px', color: '#8a86a0', margin: '32px 0 0' }
