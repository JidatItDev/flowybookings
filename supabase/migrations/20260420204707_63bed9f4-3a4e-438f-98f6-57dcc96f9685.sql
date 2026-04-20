-- Heal Mollie provider rows that were disconnected before the fix:
-- when disconnected_at is set, connection_status MUST be 'disconnected'
-- and onboarding_status MUST be 'not_started'. Connected rows are untouched.
UPDATE public.shop_payment_providers
SET connection_status = 'disconnected',
    onboarding_status = 'not_started',
    provider_account_id = NULL,
    connected_at = NULL,
    last_synced_at = NULL,
    updated_at = now()
WHERE provider = 'mollie'
  AND disconnected_at IS NOT NULL
  AND connection_status <> 'disconnected';