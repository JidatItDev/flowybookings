-- Single-row table for platform subscription billing non-secret config
CREATE TABLE IF NOT EXISTS public.platform_billing_config (
  id integer PRIMARY KEY DEFAULT 1,
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
  webhook_url_override text,
  expects_client_id boolean NOT NULL DEFAULT false,
  expects_client_secret boolean NOT NULL DEFAULT false,
  notes text,
  last_health_status text,
  last_health_message text,
  last_health_at timestamptz,
  last_health_mode text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT platform_billing_config_singleton CHECK (id = 1)
);

-- Seed the singleton row
INSERT INTO public.platform_billing_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_billing_config ENABLE ROW LEVEL SECURITY;

-- Super admin only
CREATE POLICY "platform_billing_config_admin_select"
  ON public.platform_billing_config
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "platform_billing_config_admin_update"
  ON public.platform_billing_config
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- updated_at trigger
CREATE TRIGGER update_platform_billing_config_updated_at
  BEFORE UPDATE ON public.platform_billing_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();