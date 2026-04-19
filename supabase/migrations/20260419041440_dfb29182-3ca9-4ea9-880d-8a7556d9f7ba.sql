ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS legal_consent jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.legal_consent IS 'Tracks the LEGAL_LAST_UPDATED date the user accepted for each policy: { privacy, terms, refunds } as ISO date strings.';