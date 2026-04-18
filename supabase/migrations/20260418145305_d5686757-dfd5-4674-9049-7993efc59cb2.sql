-- Per-shop automation settings + tracking columns for sent emails

CREATE TABLE public.shop_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  -- Booking lifecycle automations
  confirmation_enabled boolean NOT NULL DEFAULT true,
  reminder_24h_enabled boolean NOT NULL DEFAULT true,
  reminder_2h_enabled boolean NOT NULL DEFAULT true,
  followup_enabled boolean NOT NULL DEFAULT false,
  followup_delay_minutes integer NOT NULL DEFAULT 120, -- 2h after appointment ends
  -- Reserved for future expansion (custom workflows, channels, etc.)
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_automations_shop_unique UNIQUE (shop_id)
);

ALTER TABLE public.shop_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_automations_owner_all"
  ON public.shop_automations
  FOR ALL
  TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id))
  WITH CHECK (public.is_shop_owner(auth.uid(), shop_id));

CREATE TRIGGER trg_shop_automations_updated_at
  BEFORE UPDATE ON public.shop_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track emails sent per booking so cron doesn't double-send
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at     timestamptz;

-- Backfill: every existing shop gets a default automation row
INSERT INTO public.shop_automations (shop_id)
SELECT id FROM public.shops
ON CONFLICT (shop_id) DO NOTHING;

-- Auto-create automation row whenever a new shop is created
CREATE OR REPLACE FUNCTION public.handle_new_shop_automations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.shop_automations (shop_id) VALUES (NEW.id)
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shops_create_automations
  AFTER INSERT ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_shop_automations();