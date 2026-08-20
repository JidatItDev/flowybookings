-- Subscription notification templates for the sendEmail() pipeline.
-- Admin can edit display_name/subject/body in the email templates UI.

INSERT INTO public.email_templates (type, display_name, subject, body_html, body_text, allowed_vars)
VALUES
(
  'subscription_payment_received',
  'Betaling ontvangen',
  'Betaling ontvangen — {{plan}}',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Betaling ontvangen</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{shopName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">We hebben <strong>{{amount}}</strong> ontvangen voor je <strong>{{plan}}</strong> abonnement ({{cycle}}).</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Je toegang loopt tot {{expiresAt}}.</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{shopName}}, we hebben {{amount}} ontvangen voor je {{plan}} abonnement ({{cycle}}). Toegang tot {{expiresAt}}.',
  ARRAY['shopName','plan','amount','cycle','expiresAt']
),
(
  'subscription_plan_changed',
  'Plan gewijzigd',
  'Je plan is gewijzigd naar {{plan}}',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Plan gewijzigd</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{shopName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Je abonnement is nu <strong>{{plan}}</strong> ({{cycle}}). Vorige plan: {{oldPlan}}.</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{shopName}}, je abonnement is nu {{plan}} ({{cycle}}). Vorige plan: {{oldPlan}}.',
  ARRAY['shopName','plan','oldPlan','cycle']
),
(
  'subscription_cancelled',
  'Abonnement opgezegd',
  'Je abonnement is opgezegd',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Abonnement opgezegd</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{shopName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Je {{plan}} abonnement is opgezegd. Je houdt toegang tot {{expiresAt}}.</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{shopName}}, je {{plan}} abonnement is opgezegd. Je houdt toegang tot {{expiresAt}}.',
  ARRAY['shopName','plan','expiresAt']
),
(
  'subscription_downgrade_scheduled',
  'Downgrade gepland',
  'Downgrade gepland naar {{plan}}',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Downgrade gepland</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{shopName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Je blijft op <strong>{{oldPlan}}</strong> tot {{expiresAt}}. Daarna wissel je naar <strong>{{plan}}</strong>.</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{shopName}}, je blijft op {{oldPlan}} tot {{expiresAt}}. Daarna wissel je naar {{plan}}.',
  ARRAY['shopName','plan','oldPlan','expiresAt']
),
(
  'platform-payment-failed',
  'Abonnementsbetaling mislukt',
  'Betaling mislukt — {{plan}}',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Betaling mislukt</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{shopName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">We konden {{amount}} voor je {{plan}} abonnement niet verwerken.</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;"><a href="{{retryUrl}}">Probeer opnieuw</a></p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{shopName}}, we konden {{amount}} voor je {{plan}} abonnement niet verwerken. Probeer opnieuw: {{retryUrl}}',
  ARRAY['shopName','plan','amount','retryUrl']
)
ON CONFLICT (type) DO NOTHING;
