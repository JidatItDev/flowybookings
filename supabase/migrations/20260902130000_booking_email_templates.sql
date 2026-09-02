-- Booking-confirmation and booking-payment-failed templates for the
-- sendEmail() pipeline (Resend). These two emails previously only existed as
-- React-Email components on the legacy enqueueBookingEmail() path; Week 3
-- moves both send call sites onto sendEmail(), matching how subscription
-- emails already work.

INSERT INTO public.email_templates (type, display_name, subject, body_html, body_text, allowed_vars)
VALUES
(
  'booking-confirmation',
  'Boeking bevestigd',
  'Je boeking bij {{shopName}} is bevestigd',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Je boeking is bevestigd</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{customerName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Je boeking voor <strong>{{serviceName}}</strong> bij <strong>{{shopName}}</strong> op {{whenLabel}} is bevestigd.</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Medewerker: {{staffName}}<br/>Prijs: {{priceLabel}}<br/>Adres: {{shopAddress}}</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{customerName}}, je boeking voor {{serviceName}} bij {{shopName}} op {{whenLabel}} is bevestigd. Medewerker: {{staffName}}. Prijs: {{priceLabel}}. Adres: {{shopAddress}}.',
  ARRAY['customerName','shopName','serviceName','staffName','whenLabel','priceLabel','shopAddress']
),
(
  'booking-payment-failed',
  'Aanbetaling mislukt',
  'Je aanbetaling bij {{shopName}} is niet gelukt',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Aanbetaling niet gelukt</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{customerName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">We konden je aanbetaling van {{amountLabel}} voor <strong>{{serviceName}}</strong> bij <strong>{{shopName}}</strong> op {{whenLabel}} niet verwerken. Je gereserveerde tijd is weer vrijgegeven.</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;"><a href="{{retryUrl}}">Probeer opnieuw te boeken</a></p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{customerName}}, we konden je aanbetaling van {{amountLabel}} voor {{serviceName}} bij {{shopName}} op {{whenLabel}} niet verwerken. Probeer opnieuw: {{retryUrl}}',
  ARRAY['customerName','shopName','serviceName','whenLabel','amountLabel','retryUrl']
)
ON CONFLICT (type) DO NOTHING;
