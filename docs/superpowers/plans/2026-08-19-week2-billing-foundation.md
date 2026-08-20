# Week 2 Billing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mollie Connect and platform recurring subscriptions fully functional, close the free-Premium loophole, enforce plan limits server-side, and deliver subscription emails — all demonstrable via the extended acceptance test.

**Architecture:** Repair the existing dual-Mollie stack. Platform billing state lives on `shops` columns with `subscription_status` as SSOT; Mollie IDs stay in `onboarding` jsonb. Webhooks are the primary renewal path; a single expiry job lands lapsed shops on Starter. Owners never write plan fields — DB trigger + server routes only.

**Tech Stack:** TanStack Start/Router, Supabase (Postgres RLS + triggers), Mollie Platform API + Connect OAuth, Resend via `sendEmail()` queue, TypeScript.

## Global Constraints

- Plan tiers: `trial` | `starter` | `pro` | `premium`; unpaid floor after cancel/expiry = **starter**
- Billing cycles: `monthly` and `yearly` (yearly = 10× monthly cents)
- Upgrade = immediate after checkout; downgrade = `pending_plan` until effective date; cancel clears pending
- Only super-admin may override plans (audited, reason required)
- `plan_features` DB table is authoritative for entitlements
- Checkout return URL: `/shop/billing?billing=success`
- Email template types: `subscription_payment_received`, `subscription_plan_changed`, `subscription_cancelled`, `subscription_downgrade_scheduled`, `platform-payment-failed`
- Acceptance test: Shop A full monthly lifecycle + Shop B Pro yearly + Connect cron refresh
- **Idempotency:** enforce at webhook (check existing `provider_payment_id`), payment upsert (`ON CONFLICT DO NOTHING`), and expiry/pending application (same UPDATE clears fields). Email enqueue uses idempotency keys.
- **Activity logging:** every material billing event writes to `activity_log` with `entity = platform_billing`. See Activity Log Events table below.
- **Human review gate:** agent writes migration SQL but does NOT apply it. Human reviews, runs migration, confirms before continuing.

### Activity Log Events

| Event                    | `action`                           | Metadata                                |
| ------------------------ | ---------------------------------- | --------------------------------------- |
| First payment / activate | `subscription_activated`           | plan, cycle, payment_id                 |
| Upgrade                  | `subscription_upgraded`            | old_plan → new_plan, payment_id         |
| Downgrade scheduled      | `subscription_downgrade_scheduled` | pending_plan, effective_at              |
| Pending applied          | `subscription_plan_applied`        | old_plan → new_plan                     |
| Cancel                   | `subscription_cancelled`           | effective_date                          |
| Renewal                  | `subscription_renewed`             | new_expires, payment_id                 |
| Payment failed           | `subscription_payment_failed`      | payment_id                              |
| Expiry → Starter         | `subscription_expired_to_starter`  | old_plan                                |
| Super-admin override     | `admin_plan_override`              | reason (required), old/new plan/expires |
| Connect / disconnect     | existing actions (keep)            | —                                       |

All entries include `shop_id`, `actor_user_id` (user or `null` for system), and relevant before/after values.

**Design spec:** `docs/superpowers/specs/2026-08-19-week2-billing-design.md`

---

## File Map

| Area               | Create                                                                                                                                                                     | Modify                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema             | `supabase/migrations/20260819*_week2_billing_foundation.sql`                                                                                                               | —                                                                                                                                                              |
| Plan protection    | —                                                                                                                                                                          | trigger in migration; `src/shared/lib/plans.ts`                                                                                                                |
| Checkout / confirm | `src/shop/billing/server/plan-downgrade.ts`, `src/routes/api.billing.plan-downgrade.ts`                                                                                    | `plan-checkout.ts`, remove/gate `plan-confirm.ts`                                                                                                              |
| Webhook / expiry   | `src/shop/billing/server/billing-expiry.ts`, `src/shop/billing/server/billing-reconcile.ts`, `src/routes/hooks/billing-expiry.ts`, `src/routes/hooks/billing-reconcile.ts` | `mollie-webhook.ts`; deprecate `expire-sweep.ts`, `expire-cancelled-subscriptions.ts`                                                                          |
| Emails             | migration seeds for `email_templates`; `src/email/enqueue-subscription-email.ts`                                                                                           | `mollie-webhook.ts`, `plan-cancel.ts`, `plan-downgrade.ts`                                                                                                     |
| UI                 | —                                                                                                                                                                          | `UpgradePage.tsx`, `ShopBillingCard.tsx`, `use-pending-billing.ts`, `use-feature-access.ts`, admin `SubscriptionPanel.tsx`, `PlansPage.tsx`, `BillingPage.tsx` |
| Connect            | —                                                                                                                                                                          | `mollie-refresh-tokens.ts`, pg_cron migration if present                                                                                                       |
| Entitlements       | booking trigger in migration                                                                                                                                               | `shop_can_accept_bookings` in migration; analytics server guard                                                                                                |
| Types              | —                                                                                                                                                                          | `src/integrations/supabase/types.ts` (regenerate after migration)                                                                                              |

---

### Task 1: Database migration — billing columns, trigger, booking limit

**Files:**

- Create: `supabase/migrations/20260819120000_week2_billing_foundation.sql`

**Interfaces:**

- Produces: columns `pending_plan`, `pending_plan_effective_at`; trigger `prevent_owner_billing_column_update()`; trigger `prevent_bookings_over_plan_limit()`; updated `shop_can_accept_bookings()`

- [ ] **Step 1: Add pending plan columns**

```sql
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS pending_plan public.subscription_plan,
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamptz;

COMMENT ON COLUMN public.shops.pending_plan IS 'Scheduled plan change (typically downgrade at renewal)';
COMMENT ON COLUMN public.shops.pending_plan_effective_at IS 'When pending_plan becomes active';
```

- [ ] **Step 2: Backfill subscription_status from onboarding**

```sql
UPDATE public.shops
SET subscription_status = COALESCE(
  NULLIF(onboarding->>'subscription_status', '')::text,
  CASE WHEN plan IN ('starter','pro','premium') AND plan_expires_at > now() THEN 'active' ELSE 'none' END
)
WHERE subscription_status IS NULL OR subscription_status = '';
```

- [ ] **Step 3: Owner billing column guard trigger**

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

- [ ] **Step 4: Bookings over plan limit trigger** (mirror `prevent_staff_over_plan_limit` in `20260814114220_entity_guards_dedup_staff_limit.sql`)

```sql
CREATE OR REPLACE FUNCTION public.prevent_bookings_over_plan_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_access jsonb;
BEGIN
  SELECT public.get_shop_feature_access(NEW.shop_id, 'max_bookings_per_month') INTO v_access;
  IF (v_access->>'allowed')::boolean = false THEN
    RAISE EXCEPTION 'bookings_over_plan_limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_bookings_over_plan_limit_trg ON public.bookings;
CREATE TRIGGER prevent_bookings_over_plan_limit_trg
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_bookings_over_plan_limit();
```

- [ ] **Step 5: Update shop_can_accept_bookings to use subscription_status column**

Replace `v_onboarding->>'subscription_status'` with `shops.subscription_status`. Keep `payment_failed_at` in onboarding or migrate to column if already present.

- [ ] **Step 6: Add unique constraint for payment idempotency**

```sql
-- Ensure no duplicate payment rows for the same Mollie payment ID
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_uniq
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
```

- [ ] **Step 7: Write the migration file — STOP**

**⛔ HUMAN REVIEW GATE:** Do NOT apply this migration. Hand the SQL file to the human for review. Wait for explicit confirmation that:

1. The migration has been reviewed
2. The migration has been applied locally
3. Columns and triggers exist as expected

Only after human confirmation → proceed to Step 8.

- [ ] **Step 8: Regenerate types (after human confirms migration applied)**

Run: `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`

---

### Task 2: Fix plan-checkout onboarding bug + return URL

**Files:**

- Modify: `src/shop/billing/server/plan-checkout.ts`
- Modify: `src/routes/shop.settings.tsx` (remove billing return handling if redundant)

**Interfaces:**

- Consumes: `PLATFORM_PROVIDER`, `nextExpiry`, `BillingCycle` from `@/admin/settings/platform-billing`
- Produces: checkout redirect to `/shop/billing?billing=success`; preserves full `onboarding` jsonb on update

- [ ] **Step 1: Fix shop select to include onboarding**

Change select from `"id, name, owner_id, plan"` to `"id, name, owner_id, plan, onboarding, plan_billing_cycle, mollie_subscription_id"`.

- [ ] **Step 2: Merge onboarding on customer id write**

```typescript
const onboarding = (shop.onboarding ?? {}) as Record<string, unknown>;
const merged = { ...onboarding, mollie_customer_id: customerId };
await supabaseAdmin.from("shops").update({ onboarding: merged }).eq("id", shopId);
```

- [ ] **Step 3: Set redirect URL**

```typescript
redirectUrl: `${appUrl}/shop/billing?billing=success`,
```

- [ ] **Step 4: Include metadata on payment**

Ensure Mollie payment metadata includes `{ shop_id, plan, cycle, kind: "subscription_first" }`.

- [ ] **Step 5: Manual verify**

Start checkout from `/shop/billing`; confirm redirect lands on billing page with success toast.

---

### Task 3: Migrate subscription_status to column across server code

**Files:**

- Modify: `src/shop/payments/server/mollie-webhook.ts`
- Modify: `src/shop/billing/server/plan-cancel.ts`
- Modify: `src/shared/lib/trial.ts`
- Modify: `supabase/migrations/20260420063625_*.sql` logic via new migration (Task 1 step 5)

**Interfaces:**

- Produces: all writes to `shops.subscription_status` column; no writes to `onboarding.subscription_status`

- [ ] **Step 1: Grep and replace**

Run: `rg "subscription_status" src/` — update every read/write to use column.

- [ ] **Step 2: Webhook activation sets column + activity log**

On paid first/recurring: `subscription_status: 'active'`, clear `payment_failed_at` in onboarding if used.  
Activity log: `action = subscription_activated`, metadata `{ plan, cycle, payment_id }`.

- [ ] **Step 3: Cancel sets column**

`plan-cancel.ts`: `subscription_status: 'cancelled'`, store `subscription_cancelled_at` in onboarding if needed for display.

- [ ] **Step 4: Payment failed sets column + activity log**

Webhook failure path: `subscription_status: 'payment_failed'`.  
Activity log: `action = subscription_payment_failed`, metadata `{ payment_id }`.

- [ ] **Step 5: Update getTrialState in trial.ts**

Read `shop.subscription_status` from shop row, not onboarding jsonb.

---

### Task 4: Recurring webhook handler + payment upsert

**Files:**

- Modify: `src/shop/payments/server/mollie-webhook.ts`

**Interfaces:**

- Consumes: Mollie payment fetch; `payments` table with `provider = 'platform_mollie'`
- Produces: `handleRecurringPayment(mollie, shopId)` extending `plan_expires_at` via `nextExpiry()`

- [ ] **Step 1: When local payment row not found, attempt recurring match**

```typescript
async function resolveShopFromMolliePayment(mollie: MolliePayment): Promise<string | null> {
  const meta = mollie.metadata ?? {};
  if (meta.shop_id && meta.kind === "subscription_recurring") return meta.shop_id as string;
  if (mollie.subscriptionId) {
    const { data } = await supabaseAdmin
      .from("shops")
      .select("id")
      .contains("onboarding", { mollie_subscription_id: mollie.subscriptionId })
      .maybeSingle();
    return data?.id ?? null;
  }
  return null;
}
```

- [ ] **Step 2: Idempotent payment upsert for recurring**

```typescript
const { data: existing } = await supabaseAdmin
  .from("payments")
  .select("id")
  .eq("provider", "platform_mollie")
  .eq("provider_payment_id", mollie.id)
  .maybeSingle();
if (existing) {
  console.log("[mollie/webhook] already processed", mollie.id);
  return new Response("OK", { status: 200 });
}
```

Insert: `{ shop_id, provider: 'platform_mollie', provider_payment_id: mollie.id, amount_cents, status: 'paid', metadata: { kind: 'subscription_recurring', plan, cycle } }`.  
Use `ON CONFLICT (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL DO NOTHING` as safety net.

- [ ] **Step 3: Extend plan_expires_at**

Use existing `nextExpiry(plan, cycle, fromDate)` from platform-billing.

- [ ] **Step 4: Apply pending_plan if effective (idempotent)**

If `pending_plan IS NOT NULL AND pending_plan_effective_at <= now()`: apply plan change and clear pending fields **in the same UPDATE** (prevents double application from both webhook and expiry job).

- [ ] **Step 5: Activity log — subscription_renewed**

```typescript
await supabaseAdmin.from("activity_log").insert({
  shop_id: shopId,
  actor_user_id: null, // system
  action: "subscription_renewed",
  entity: "platform_billing",
  metadata: { payment_id: mollie.id, new_expires_at: newExpiry, plan, cycle },
});
```

- [ ] **Step 6: Enqueue subscription_payment_received email**

Call enqueue helper (Task 7) with idempotency key `subscription_payment_received:${mollie.id}`.

- [ ] **Step 7: Test with Mollie test mode webhook simulator or mock payload**

Expected: new payment row + extended expiry + activity_log row. Second call with same ID → 200 + no duplicate.

---

### Task 5: Plan downgrade server route

**Files:**

- Create: `src/shop/billing/server/plan-downgrade.ts`
- Create: `src/routes/api.billing.plan-downgrade.ts`
- Modify: `src/shop/billing/UpgradePage.tsx`

**Interfaces:**

- Produces: `POST /api/billing/plan-downgrade` body `{ shop_id, target_plan, cycle? }`
- Consumes: Mollie PATCH subscription API; `subscriptionAmountCents()`

- [ ] **Step 1: Implement handler**

1. Verify shop owner auth.
2. Validate target tier < current tier.
3. Compute `pending_plan_effective_at` = current `plan_expires_at`.
4. PATCH Mollie subscription amount/interval for next period.
5. Update shop: `pending_plan`, `pending_plan_effective_at` — **do not change `plan`**.
6. Clear conflicting pending if upgrade had been scheduled (N/A here).
7. Activity log: `action = subscription_downgrade_scheduled`, metadata `{ old_plan, pending_plan, effective_at }`.
8. Enqueue `subscription_downgrade_scheduled` email with idempotency key `downgrade_scheduled:${shop_id}:${effective_at}`.
9. Insert in-app notification.

- [ ] **Step 2: Replace downgrade mutation in UpgradePage**

Remove `changeShopPlan` call; `fetch('/api/billing/plan-downgrade', { method: 'POST', ... })`.

- [ ] **Step 3: Update toast copy**

Toast should say plan stays active until effective date.

- [ ] **Step 4: Verify UI shows pending line**

ShopBillingCard reads `pending_plan` + `pending_plan_effective_at`.

---

### Task 6: Upgrade checkout + cancel pending clearing

**Files:**

- Modify: `src/shop/billing/server/plan-checkout.ts`
- Modify: `src/shop/payments/server/mollie-webhook.ts` (first payment success path)
- Modify: `src/shop/billing/server/plan-cancel.ts`

**Interfaces:**

- Upgrade webhook path clears `pending_plan`, `pending_plan_effective_at`
- Cancel path clears pending fields

- [ ] **Step 1: plan-checkout supports upgrade metadata**

Set `metadata.kind = 'subscription_upgrade'` when current plan is paid and target is higher tier.

- [ ] **Step 2: Webhook on upgrade success**

Update plan immediately; PATCH/create Mollie sub; clear pending.  
Activity log: `action = subscription_upgraded`, metadata `{ old_plan, new_plan, payment_id }`.  
Enqueue `subscription_plan_changed` + `subscription_payment_received` (idempotency key per payment_id).

- [ ] **Step 3: plan-cancel clears pending**

```typescript
await supabaseAdmin
  .from("shops")
  .update({
    subscription_status: "cancelled",
    pending_plan: null,
    pending_plan_effective_at: null,
    onboarding: { ...onboarding, subscription_cancelled_at: new Date().toISOString() },
  })
  .eq("id", shopId);
```

- [ ] **Step 4: Activity log + enqueue subscription_cancelled email**

Activity log: `action = subscription_cancelled`, metadata `{ plan, effective_date: plan_expires_at }`.  
Enqueue email with idempotency key `subscription_cancelled:${shop_id}:${now}`.

---

### Task 7: Subscription email templates + enqueue helper

**Files:**

- Create: migration `supabase/migrations/20260819130000_subscription_email_templates.sql`
- Create: `src/email/enqueue-subscription-email.ts`
- Modify: webhook, plan-cancel, plan-downgrade

**Interfaces:**

- Produces: `enqueueSubscriptionEmail({ type, shopId, to, data, idempotencyKey })`

- [ ] **Step 1: Seed email_templates**

```sql
INSERT INTO public.email_templates (type, display_name, subject, body_html, body_text, allowed_vars)
VALUES
  ('subscription_payment_received', 'Betaling ontvangen', 'Betaling ontvangen — {{plan}}',
   '<p>Bedankt! We hebben {{amount}} ontvangen voor je {{plan}} abonnement.</p>',
   'Bedankt! We hebben {{amount}} ontvangen voor je {{plan}} abonnement.',
   ARRAY['shopName','plan','amount','cycle','expiresAt']),
  ('subscription_plan_changed', 'Plan gewijzigd', 'Je plan is gewijzigd naar {{plan}}', ...),
  ('subscription_cancelled', 'Abonnement opgezegd', 'Je abonnement is opgezegd', ...),
  ('subscription_downgrade_scheduled', 'Downgrade gepland', 'Downgrade gepland naar {{plan}}', ...)
ON CONFLICT (type) DO NOTHING;
```

- [ ] **Step 2: Implement enqueue helper using sendEmail**

```typescript
import { sendEmail } from "@/email/send-email";

export async function enqueueSubscriptionEmail(opts: {
  type: string;
  shopId: string;
  to: string;
  data: Record<string, string>;
  idempotencyKey: string;
}) {
  return sendEmail({
    type: opts.type,
    to: opts.to,
    data: opts.data,
    idempotencyKey: opts.idempotencyKey,
  });
}
```

- [ ] **Step 3: Wire platform-payment-failed in webhook** (existing template slug)

- [ ] **Step 4: Admin can edit templates** — verify in admin email settings UI.

---

### Task 8: Single billing expiry job

**Files:**

- Create: `src/shop/billing/server/billing-expiry.ts`
- Create: `src/routes/hooks/billing-expiry.ts`
- Modify: remove or redirect old routes `expire-sweep`, `expire-cancelled-subscriptions`

**Interfaces:**

- Produces: `POST /hooks/billing-expiry` guarded by `CRON_SECRET`

- [ ] **Step 1: Implement unified expiry logic**

Select shops where:

- (`subscription_status = 'cancelled'` OR paid plan expired) AND `plan_expires_at < now()` AND `plan IN ('starter','pro','premium')`

Update: `plan = 'starter'`, `subscription_status = 'none'`, clear pending, clear mollie sub ref in onboarding.  
Activity log for each: `action = subscription_expired_to_starter`, metadata `{ old_plan, shop_id }`.

- [ ] **Step 2: Apply pending_plan when effective date passed (idempotent — same UPDATE clears fields)**

If `pending_plan IS NOT NULL AND pending_plan_effective_at <= now()`: set `plan = pending_plan`, clear pending, recompute expiry.  
Activity log: `action = subscription_plan_applied`, metadata `{ old_plan, new_plan }`.

- [ ] **Step 3: pg_cron or document manual trigger**

Add cron migration calling `/hooks/billing-expiry` daily, or update existing cron SQL.

- [ ] **Step 4: Deprecate old handlers**

Leave routes returning 410 or delegate to new handler for backwards compatibility.

---

### Task 9: Billing reconciliation cron (recovery)

**Files:**

- Create: `src/shop/billing/server/billing-reconcile.ts`
- Create: `src/routes/hooks/billing-reconcile.ts`

- [ ] **Step 1: Find active shops with Mollie sub id where plan_expires_at < now() + 1 day**

- [ ] **Step 2: Fetch recent Mollie payments for customer; replay any paid recurring not in payments table**

- [ ] **Step 3: Schedule daily via pg_cron with CRON_SECRET**

---

### Task 10: Close owner plan-confirm + refactor changeShopPlan

**Files:**

- Modify: `src/shop/billing/server/plan-confirm.ts`
- Modify: `src/shop/billing/ShopBillingCard.tsx`
- Modify: `src/shared/lib/plans.ts`
- Modify: `src/admin/plans/PlansPage.tsx`, `src/admin/billing/BillingPage.tsx`, `src/admin/shops/SubscriptionPanel.tsx`

- [ ] **Step 1: Gate plan-confirm to super-admin + test mode**

Return 403 for shop owners always.

- [ ] **Step 2: Remove mock-pay button from ShopBillingCard for owners**

Keep admin-only test path in admin billing UI if needed.

- [ ] **Step 3: Split changeShopPlan**

- `adminOverrideShopPlan()` — server-side or RPC, requires super-admin, writes audit with required reason.
- Delete owner path from client-accessible code.

- [ ] **Step 4: Update admin panels to call admin override API**

POST `/api/admin/billing/plan-override` with `{ shop_id, new_plan, new_expires, reason }`.

- [ ] **Step 5: Acceptance bypass test**

As shop owner, attempt direct Supabase update and plan-confirm → both fail.

---

### Task 11: Entitlements — plan_features authoritative + analytics guard

**Files:**

- Modify: `src/shared/lib/plans.ts`
- Modify: `src/shop/billing/use-feature-access.ts`
- Modify: `src/shop/analytics/AnalyticsPage.tsx`
- Create: server guard in analytics data route or RPC if exists

- [ ] **Step 1: Deprecate FEATURES map for runtime gating**

Keep tier helpers; remove `planAllows()` usage in favor of `useFeatureAccess` / RPC.

- [ ] **Step 2: Ensure useFeatureAccess reads get_shop_feature_access only**

- [ ] **Step 3: Add server-side analytics guard**

If analytics API route exists, check RPC before returning data. If page-only, add loader that redirects when not allowed.

- [ ] **Step 4: Fix TS/DB mismatch**

Align seed or remove stale FEATURES entries for sms/whatsapp tiers.

---

### Task 12: Billing UI — full status display

**Files:**

- Modify: `src/shop/billing/ShopBillingCard.tsx`
- Modify: `src/shop/billing/use-pending-billing.ts`
- Modify: `src/shop/billing/UpgradePage.tsx`

- [ ] **Step 1: Status badge component**

Render: Active | Cancelled — access until {date} | Payment failed | Scheduled change to {pending_plan} on {date}

- [ ] **Step 2: Show billing cycle + renewal date from shop row**

- [ ] **Step 3: Last 5 platform payments query**

Query `payments` where `provider = 'platform_mollie'` order by created_at desc limit 5.

- [ ] **Step 4: Yearly cycle toggle on upgrade page** (verify already present; wire to checkout)

- [ ] **Step 5: Navigate canonical routes to /shop/billing**

Update nav links if any still point to /shop/upgrade only.

---

### Task 13: Mollie Connect cron fix

**Files:**

- Modify: `src/shop/payments/server/mollie-refresh-tokens.ts`
- Modify: pg_cron migration (grep `mollie-refresh-tokens` in supabase/migrations)

- [ ] **Step 1: Replace hardcoded URL with `${serverEnv.APP_URL}/hooks/mollie-refresh-tokens`**

- [ ] **Step 2: Pass CRON_SECRET header/query**

- [ ] **Step 3: Verify hook auth matches other crons**

- [ ] **Step 4: Acceptance — trigger hook manually, confirm tokens still valid**

---

### Task 14: Acceptance test execution

**Files:**

- Create: `docs/superpowers/plans/2026-08-19-week2-billing-acceptance.md` (optional checklist)

- [ ] **Step 1: Shop A monthly lifecycle** (see design spec)

- [ ] **Step 2: Shop B Pro yearly**

- [ ] **Step 3: Trial shop booking cap (30) + staff limit + analytics gate**

- [ ] **Step 4: API bypass attempts documented with expected 403/errors**

- [ ] **Step 5: Verify 5 email types in inbox or email_send_log**

---

## Spec Coverage Self-Review

| Requirement                       | Task                  |
| --------------------------------- | --------------------- |
| Mollie Connect functional         | 13 (+ existing OAuth) |
| Starter/Pro/Premium subscriptions | 2, 4, 6               |
| Monthly + yearly                  | 2, 12                 |
| Upgrade/downgrade/cancel          | 5, 6                  |
| Billing page fixes                | 12                    |
| Close Premium loophole            | 1, 10                 |
| Server limits                     | 1, 11                 |
| Subscription emails               | 7                     |
| Extended acceptance test          | 14                    |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-19-week2-billing-foundation.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach do you want?
