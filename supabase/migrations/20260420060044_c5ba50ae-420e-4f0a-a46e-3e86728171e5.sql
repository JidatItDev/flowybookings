-- Plan-features mapping table
CREATE TABLE public.plan_features (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_name public.subscription_plan NOT NULL,
  feature_slug text NOT NULL,
  is_included boolean NOT NULL DEFAULT false,
  limit_value integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_name, feature_slug)
);

CREATE INDEX idx_plan_features_plan ON public.plan_features (plan_name);

ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

-- Public read: anyone can see plan capabilities (used for pricing UI + gating)
CREATE POLICY plan_features_public_read
  ON public.plan_features FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only super admins may write
CREATE POLICY plan_features_admin_write
  ON public.plan_features FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Auto updated_at
CREATE TRIGGER plan_features_set_updated_at
  BEFORE UPDATE ON public.plan_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: TRIAL
INSERT INTO public.plan_features (plan_name, feature_slug, is_included, limit_value) VALUES
  ('trial', 'max_bookings_per_month', true, 30),
  ('trial', 'max_staff', true, 1),
  ('trial', 'platform_fee_percentage', true, 0),
  ('trial', 'email_reminders', true, NULL),
  ('trial', 'sms_reminders', false, NULL),
  ('trial', 'whatsapp_reminders', false, NULL),
  ('trial', 'marketing_emails', false, NULL),
  ('trial', 'advanced_analytics', false, NULL),
  ('trial', 'custom_branding', false, NULL),
  ('trial', 'google_reviews', false, NULL),
  ('trial', 'waitlist', false, NULL),
  ('trial', 'multi_location', false, NULL),
  ('trial', 'white_label', false, NULL),
  ('trial', 'api_access', false, NULL),
  ('trial', 'priority_support', false, NULL);

-- Seed: STARTER (€19)
INSERT INTO public.plan_features (plan_name, feature_slug, is_included, limit_value) VALUES
  ('starter', 'max_bookings_per_month', true, NULL),
  ('starter', 'max_staff', true, 3),
  ('starter', 'platform_fee_percentage', true, 1),
  ('starter', 'email_reminders', true, NULL),
  ('starter', 'sms_reminders', true, 100),
  ('starter', 'whatsapp_reminders', false, NULL),
  ('starter', 'marketing_emails', true, 50),
  ('starter', 'advanced_analytics', false, NULL),
  ('starter', 'custom_branding', false, NULL),
  ('starter', 'google_reviews', false, NULL),
  ('starter', 'waitlist', false, NULL),
  ('starter', 'multi_location', false, NULL),
  ('starter', 'white_label', false, NULL),
  ('starter', 'api_access', false, NULL),
  ('starter', 'priority_support', false, NULL);

-- Seed: PRO (€49)
INSERT INTO public.plan_features (plan_name, feature_slug, is_included, limit_value) VALUES
  ('pro', 'max_bookings_per_month', true, NULL),
  ('pro', 'max_staff', true, 10),
  ('pro', 'platform_fee_percentage', true, 1),
  ('pro', 'email_reminders', true, NULL),
  ('pro', 'sms_reminders', true, 300),
  ('pro', 'whatsapp_reminders', true, 200),
  ('pro', 'marketing_emails', true, 200),
  ('pro', 'advanced_analytics', true, NULL),
  ('pro', 'custom_branding', true, NULL),
  ('pro', 'google_reviews', false, NULL),
  ('pro', 'waitlist', false, NULL),
  ('pro', 'multi_location', false, NULL),
  ('pro', 'white_label', false, NULL),
  ('pro', 'api_access', false, NULL),
  ('pro', 'priority_support', false, NULL);

-- Seed: PREMIUM (€99)
INSERT INTO public.plan_features (plan_name, feature_slug, is_included, limit_value) VALUES
  ('premium', 'max_bookings_per_month', true, NULL),
  ('premium', 'max_staff', true, NULL),
  ('premium', 'platform_fee_percentage', true, 0),
  ('premium', 'email_reminders', true, NULL),
  ('premium', 'sms_reminders', true, 1000),
  ('premium', 'whatsapp_reminders', true, 500),
  ('premium', 'marketing_emails', true, NULL),
  ('premium', 'advanced_analytics', true, NULL),
  ('premium', 'custom_branding', true, NULL),
  ('premium', 'google_reviews', true, NULL),
  ('premium', 'waitlist', true, NULL),
  ('premium', 'multi_location', true, NULL),
  ('premium', 'white_label', false, NULL),
  ('premium', 'api_access', true, NULL),
  ('premium', 'priority_support', true, NULL);

-- Note: platform_fee_percentage limit_value is stored ×10 conceptually (0=0%, 1=1%, etc.)
-- We use a separate text column? No — keep simple: platform fee is read elsewhere from plans.ts.
-- The integer limit_value above is rounded; real fee stays in src/lib/plans.ts as source of truth.