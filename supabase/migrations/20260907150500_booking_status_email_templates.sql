-- booking-cancelled and booking-rescheduled templates for the sendEmail()
-- pipeline, matching the exact shape of 20260902130000_booking_email_templates.sql.
-- Cancellation reason is intentionally NOT included in the customer-facing
-- email — it's an internal note for the shop, not customer-facing copy.

INSERT INTO public.email_templates (type, display_name, subject, body_html, body_text, allowed_vars)
VALUES
(
  'booking-cancelled',
  'Boeking geannuleerd',
  'Je boeking bij {{shopName}} is geannuleerd',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Je boeking is geannuleerd</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{customerName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Je boeking voor <strong>{{serviceName}}</strong> bij <strong>{{shopName}}</strong> op {{whenLabel}} is geannuleerd.</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Heb je hier vragen over? Antwoord gewoon op deze e-mail.</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{customerName}}, je boeking voor {{serviceName}} bij {{shopName}} op {{whenLabel}} is geannuleerd. Vragen? Antwoord op deze e-mail.',
  ARRAY['customerName','shopName','serviceName','whenLabel']
),
(
  'booking-rescheduled',
  'Boeking verzet',
  'Je boeking bij {{shopName}} is verzet',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Je afspraak is verzet</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{customerName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Je boeking voor <strong>{{serviceName}}</strong> bij <strong>{{shopName}}</strong> is verzet van {{oldWhenLabel}} naar <strong>{{whenLabel}}</strong>.</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Medewerker: {{staffName}}<br/>Adres: {{shopAddress}}</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{customerName}}, je boeking voor {{serviceName}} bij {{shopName}} is verzet van {{oldWhenLabel}} naar {{whenLabel}}. Medewerker: {{staffName}}. Adres: {{shopAddress}}.',
  ARRAY['customerName','shopName','serviceName','oldWhenLabel','whenLabel','staffName','shopAddress']
)
ON CONFLICT (type) DO NOTHING;
