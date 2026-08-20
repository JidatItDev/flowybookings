# Task 1: Database migration — billing columns, trigger, booking limit

**File to create:** `supabase/migrations/20260819120000_week2_billing_foundation.sql`

**Produces:** columns `pending_plan`, `pending_plan_effective_at`; trigger `prevent_owner_billing_column_update()`; trigger `prevent_bookings_over_plan_limit()`; updated `shop_can_accept_bookings()`; updated `validate_shop_subscription_status()` to allow `'none'`; unique index on `payments(provider, provider_payment_id)`

## Steps

### Step 1: Add pending plan columns

```sql
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS pending_plan public.subscription_plan,
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamptz;

COMMENT ON COLUMN public.shops.pending_plan IS 'Scheduled plan change (typically downgrade at renewal)';
COMMENT ON COLUMN public.shops.pending_plan_effective_at IS 'When pending_plan becomes active';
```

### Step 2: Backfill subscription_status from onboarding

```sql
UPDATE public.shops
SET subscription_status = COALESCE(
  NULLIF(onboarding->>'subscription_status', '')::text,
  CASE WHEN plan IN ('starter','pro','premium') AND plan_expires_at > now() THEN 'active' ELSE 'none' END
)
WHERE subscription_status IS NULL OR subscription_status = '';
```

### Step 3: Update validate_shop_subscription_status to allow 'none'

The existing validation trigger (migration `20260420080802`) allows: `('active','trial','expired','cancelled','paused','payment_failed')`. We need to add `'none'` as the design spec uses it as the post-expiry/never-subscribed status.

```sql
CREATE OR REPLACE FUNCTION public.validate_shop_subscription_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_status NOT IN ('active','trial','expired','cancelled','paused','payment_failed','none') THEN
    RAISE EXCEPTION 'invalid subscription_status: %', NEW.subscription_status;
  END IF;
  RETURN NEW;
END;
$$;
```

### Step 4: Owner billing column guard trigger

```sql
CREATE OR REPLACE FUNCTION public.prevent_owner_billing_column_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF public.is_shop_owner(auth.uid(), OLD.id) THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at
       OR NEW.plan_billing_cycle IS DISTINCT FROM OLD.plan_billing_cycle
       OR NEW.pending_plan IS DISTINCT FROM OLD.pending_plan
       OR NEW.pending_plan_effective_at IS DISTINCT FROM OLD.pending_plan_effective_at
       OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
    THEN
      RAISE EXCEPTION 'billing_columns_owner_update_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_owner_billing_update_trg ON public.shops;
CREATE TRIGGER prevent_owner_billing_update_trg
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_billing_column_update();
```

### Step 5: Bookings over plan limit trigger

Mirror `prevent_staff_over_plan_limit` from `20260814114220_entity_guards_dedup_staff_limit.sql`. Use the same pattern but for `max_bookings_per_month`. The existing `get_shop_feature_access` RPC already handles trial vs paid counting logic correctly.

```sql
CREATE OR REPLACE FUNCTION public.prevent_bookings_over_plan_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_access jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT public.get_shop_feature_access(NEW.shop_id, 'max_bookings_per_month') INTO v_access;
  IF (v_access->>'allowed')::boolean = false THEN
    RAISE EXCEPTION 'bookings_over_plan_limit'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_bookings_over_plan_limit_trg ON public.bookings;
CREATE TRIGGER prevent_bookings_over_plan_limit_trg
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_bookings_over_plan_limit();
```

Note: added `auth.role()` check matching staff trigger pattern — service_role/seed inserts bypass.

### Step 6: Update shop_can_accept_bookings to use subscription_status column

Current function reads `v_onboarding->>'subscription_status'`. Replace with `shops.subscription_status` column. Keep `payment_failed_at` from onboarding for grace period.

Current function (from migration `20260420063625`):
- Selects `plan, plan_expires_at, onboarding`
- Reads `v_sub_status := v_onboarding->>'subscription_status'`
- Reads `v_failed_at := NULLIF(v_onboarding->>'payment_failed_at', '')::timestamptz`

Updated function should:
- Select `plan, plan_expires_at, subscription_status, onboarding`
- Use column directly: `v_sub_status := shops.subscription_status`
- Keep reading `payment_failed_at` from onboarding (not yet a column)

### Step 7: Add unique constraint for payment idempotency

```sql
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_uniq
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
```

### Step 8: Write the migration file — STOP

**⛔ HUMAN REVIEW GATE:** Do NOT apply this migration. Do NOT run `supabase db reset` or `supabase migration up`. Write the SQL file only and report back.

## Important context

- `shops` already has column `subscription_status text NOT NULL DEFAULT 'active'` (migration `20260420080802`)
- `shops` already has columns: `plan`, `plan_expires_at`, `plan_billing_cycle`, `onboarding` (jsonb), `mollie_subscription_id`, `next_billing_at`, `subscription_notes`
- `subscription_plan` is an existing enum: `'trial' | 'starter' | 'pro' | 'premium'`
- Staff trigger pattern in `20260814114220` is the model to follow for the booking trigger
- `get_shop_feature_access(_shop_id uuid, _feature_slug text)` already exists and handles trial lifetime vs paid monthly counting
- `is_super_admin(uid)` and `is_shop_owner(uid, shop_id)` already exist
- `auth.uid()` and `auth.role()` are Supabase auth helpers available in triggers
