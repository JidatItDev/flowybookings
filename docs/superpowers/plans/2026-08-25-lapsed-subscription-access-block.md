# Lapsed Subscription Access Block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a shop's subscription has fully lapsed (`shops.subscription_status = 'none'` — set by the expiry-sweep cron after a cancelled or unpaid plan's access window ends), hard-block the shop from creating new bookings, using any gated feature, and viewing the dashboard, redirecting the owner/staff to `/shop/upgrade` until they resubscribe.

**Architecture:** Two DB functions (`shop_can_accept_bookings`, `get_shop_feature_access`) currently key only off `shops.plan`, so a lapsed shop silently keeps free, indefinite access to its last paid plan (Starter et al. are paid-only tiers — there is no free tier in this product). Fix is surgical: add a `subscription_status = 'none'` branch to both SQL functions (no new enum value, no `subscriptions` table), mirror the same rule in the client-side `getTrialState()` pure function, surface it via a new `TrialBanner` case, and add a redirect in `ShopLayout` so the dashboard itself isn't reachable while lapsed. Also correct a stale/unused translation string that incorrectly claims lapsed shops "move back to the free trial" (they never have — expiry sweep always lands on `plan: starter, subscription_status: none`).

**Tech Stack:** TanStack Start (React), Supabase Postgres (plpgsql functions, RLS), Vitest.

**Spec:** This conversation — see the audit + design decisions above. User confirmed: (1) hard block (redirect away, not read-only), (2) surgical SQL fix reusing the existing `subscription_status` column, no new `subscription_plan` enum value.

## Global Constraints

- No proration, no new `subscriptions` table, no new enum value — reuse `shops.subscription_status = 'none'` exactly as already written by `billing-expiry.ts`.
- No grace period for this state (unlike `payment_failed`, which gets 7 days) — block immediately, since the whole point is the grace period already ran out during `payment_failed`, or the owner explicitly cancelled and had until `plan_expires_at` to reactivate.
- Super admins (impersonation/support) must NOT be blocked by a shop's own lapsed status.
- Trial shops must never be affected by this change — `subscription_status = 'none'` is only meaningful for non-trial plans; a trial shop's own expiry is handled entirely separately (`isTrial`/`isExpired`).
- Match existing code patterns exactly: the `payment_failed` grace-expired branch in both SQL functions and in `trial.ts`/`TrialBanner.tsx` is the template to follow.

---

## File Structure

- Modify: `supabase/migrations/` — new migration file replacing both SQL functions (Postgres migrations are append-only; never edit an old migration file).
- Modify: `src/shared/lib/trial.ts` — add `isLapsed` field, fix `canAcceptBookings` for `'none'`.
- Modify: `src/shared/lib/__tests__/trial.test.ts` — new test cases.
- Modify: `src/shop/shell/TrialBanner.tsx` — new banner case.
- Modify: `src/shop/shell/ShopLayout.tsx` — redirect guard in `ShopLayoutInner`.
- Modify: `src/shared/lib/translations/en.ts`, `src/shared/lib/translations/nl.ts` — new keys, remove two dead/wrong keys.
- Modify: `.claude/HANDOFF.md`, `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md` — close out the open item, log the manual verification.

---

### Task 1: SQL migration — block `'none'` in both gating functions

**Files:**
- Create: `supabase/migrations/20260825120000_lapsed_subscription_block.sql`

**Interfaces:**
- Consumes: existing `public.shops.subscription_status` column (already written as `'none'` by `billing-expiry.ts`'s expiry sweep — no schema change).
- Produces: `public.shop_can_accept_bookings(_shop_id uuid) RETURNS boolean` and `public.get_shop_feature_access(_shop_id uuid, _feature_slug text) RETURNS TABLE(allowed boolean, limit_value integer, used integer, upgrade_plan text, current_plan text)` — same signatures as before, callers unchanged.

- [ ] **Step 1: Write the migration file**

```sql
-- Block bookings and gated features once a subscription has fully lapsed
-- (subscription_status = 'none' — set by billing-expiry.ts's expiry sweep
-- after a cancelled/unpaid paid plan's access window ends). Previously
-- both functions ignored this status entirely and kept gating purely on
-- shops.plan, so a lapsed shop kept full, free, indefinite access to its
-- last paid plan's features (there is no free tier in this product —
-- Starter is a paid plan). No grace period here, unlike payment_failed:
-- by the time a shop reaches 'none' the grace period already ran out, or
-- the owner had until plan_expires_at to reactivate.

CREATE OR REPLACE FUNCTION public.shop_can_accept_bookings(_shop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plan;
  v_expires timestamptz;
  v_failed_at timestamptz;
  v_sub_status text;
BEGIN
  SELECT plan, plan_expires_at, subscription_status, payment_failed_at
    INTO v_plan, v_expires, v_sub_status, v_failed_at
    FROM public.shops
   WHERE id = _shop_id;

  IF v_plan IS NULL THEN
    RETURN false;
  END IF;

  IF v_plan = 'trial' THEN
    RETURN v_expires IS NULL OR v_expires > now();
  END IF;

  IF v_sub_status = 'none' THEN
    RETURN false;
  END IF;

  IF v_sub_status = 'payment_failed' AND v_failed_at IS NOT NULL THEN
    RETURN v_failed_at > (now() - interval '7 days');
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shop_feature_access(_shop_id uuid, _feature_slug text)
RETURNS TABLE(allowed boolean, limit_value integer, used integer, upgrade_plan text, current_plan text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan public.subscription_plan;
  v_sub_status text;
  v_included boolean;
  v_limit integer;
  v_used integer := 0;
  v_upgrade text := NULL;
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end timestamptz := (date_trunc('month', now()) + interval '1 month');
  v_override_included boolean;
  v_override_limit integer;
  v_has_override boolean := false;
BEGIN
  IF NOT public.has_shop_access(auth.uid(), _shop_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT plan, subscription_status INTO v_plan, v_sub_status FROM public.shops WHERE id = _shop_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'shop not found';
  END IF;

  IF v_plan <> 'trial' AND v_sub_status = 'none' THEN
    RETURN QUERY SELECT false, NULL::integer, 0, NULL::text, v_plan::text;
    RETURN;
  END IF;

  SELECT pf.is_included, pf.limit_value
    INTO v_included, v_limit
    FROM public.plan_features pf
   WHERE pf.plan_name = v_plan AND pf.feature_slug = _feature_slug;

  SELECT o.is_included, o.limit_value, true
    INTO v_override_included, v_override_limit, v_has_override
    FROM public.shop_feature_overrides o
   WHERE o.shop_id = _shop_id
     AND o.feature_slug = _feature_slug
     AND (o.expires_at IS NULL OR o.expires_at > now())
   LIMIT 1;

  IF v_has_override THEN
    v_included := v_override_included;
    v_limit := v_override_limit;
  END IF;

  IF _feature_slug = 'sms_reminders' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.sms_send_log
     WHERE shop_id = _shop_id
       AND status NOT IN ('skipped_no_credits', 'failed')
       AND created_at >= v_month_start
       AND created_at <  v_month_end;
  ELSIF _feature_slug = 'marketing_emails' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.email_send_log
     WHERE template_name = 'marketing'
       AND created_at >= v_month_start
       AND created_at <  v_month_end
       AND (metadata->>'shop_id') = _shop_id::text;
  ELSIF _feature_slug = 'max_bookings_per_month' THEN
    IF v_plan = 'trial' THEN
      SELECT COUNT(*)::int INTO v_used
        FROM public.bookings
       WHERE shop_id = _shop_id;
    ELSE
      SELECT COUNT(*)::int INTO v_used
        FROM public.bookings
       WHERE shop_id = _shop_id
         AND created_at >= v_month_start
         AND created_at <  v_month_end;
    END IF;
  ELSIF _feature_slug = 'max_staff' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.staff
     WHERE shop_id = _shop_id;
  ELSE
    v_used := 0;
  END IF;

  IF COALESCE(v_included, false) = false THEN
    SELECT pf.plan_name::text INTO v_upgrade
      FROM public.plan_features pf
     WHERE pf.feature_slug = _feature_slug
       AND pf.is_included = true
     ORDER BY CASE pf.plan_name
                WHEN 'trial'   THEN 1
                WHEN 'starter' THEN 2
                WHEN 'pro'     THEN 3
                WHEN 'premium' THEN 4
              END
     LIMIT 1;
  ELSIF v_limit IS NOT NULL AND v_used >= v_limit THEN
    SELECT pf.plan_name::text INTO v_upgrade
      FROM public.plan_features pf
     WHERE pf.feature_slug = _feature_slug
       AND pf.is_included = true
       AND (pf.limit_value IS NULL OR pf.limit_value > v_limit)
       AND CASE pf.plan_name
             WHEN 'trial'   THEN 1
             WHEN 'starter' THEN 2
             WHEN 'pro'     THEN 3
             WHEN 'premium' THEN 4
           END > CASE v_plan
             WHEN 'trial'   THEN 1
             WHEN 'starter' THEN 2
             WHEN 'pro'     THEN 3
             WHEN 'premium' THEN 4
           END
     ORDER BY CASE pf.plan_name
                WHEN 'trial'   THEN 1
                WHEN 'starter' THEN 2
                WHEN 'pro'     THEN 3
                WHEN 'premium' THEN 4
              END
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_included, false)
      AND (v_limit IS NULL OR v_used < v_limit) AS allowed,
    v_limit,
    v_used,
    v_upgrade,
    v_plan::text;
END;
$function$;
```

- [ ] **Step 2: Diff against the current live definitions to confirm the only behavioral change is the new early-return branch**

Run: `git diff --no-index <(awk '/CREATE OR REPLACE FUNCTION public.shop_can_accept_bookings/,/^\$\$;/' supabase/migrations/20260821190000_billing_mollie_columns.sql) <(awk '/CREATE OR REPLACE FUNCTION public.shop_can_accept_bookings/,/^\$\$;/' supabase/migrations/20260825120000_lapsed_subscription_block.sql)`

Expected: only the added `IF v_sub_status = 'none' THEN RETURN false; END IF;` block (and the new `v_sub_status`/early-return additions for `get_shop_feature_access`) show up as additions — nothing else differs.

- [ ] **Step 3: Apply the migration to the Supabase project** (via whatever mechanism this project already uses to apply hand-authored migrations — Supabase CLI `db push` or the SQL editor; there is no npm script for this, confirmed via `package.json`)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260825120000_lapsed_subscription_block.sql
git commit -m "fix (billing): block bookings and features when subscription_status is none"
```

---

### Task 2: `getTrialState()` — add `isLapsed`, fix `canAcceptBookings`

**Files:**
- Modify: `src/shared/lib/trial.ts:5-8` (header comment), `:22-37` (`TrialState` type), `:87-95` (composite gate), `:97-101` (return statement), `:47-52` (null-shop default)
- Test: `src/shared/lib/__tests__/trial.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TrialState.isLapsed: boolean` — new field, `true` iff `!isTrial && subscriptionStatus === "none"`. Consumed by Task 3 (`TrialBanner.tsx`) and Task 4 (`ShopLayout.tsx`).

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/lib/__tests__/trial.test.ts` (inside the existing `describe("getTrialState", ...)` block, after the "missing subscription_status on a paid plan defaults to active" test):

```ts
  test("subscription_status 'none' blocks bookings and marks the shop lapsed", () => {
    const state = getTrialState({ plan: "starter", subscription_status: "none" });
    expect(state.subscriptionStatus).toBe("none");
    expect(state.isLapsed).toBe(true);
    expect(state.canAcceptBookings).toBe(false);
  });

  test("a trial shop is never marked lapsed even with a stale subscription_status of 'none'", () => {
    const state = getTrialState({
      plan: "trial",
      plan_expires_at: new Date(Date.now() + DAY_MS).toISOString(),
      subscription_status: "none",
    });
    expect(state.isLapsed).toBe(false);
    expect(state.canAcceptBookings).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/lib/__tests__/trial.test.ts`
Expected: FAIL — `state.isLapsed` is `undefined` (property doesn't exist yet) and the first test's `canAcceptBookings` is currently `true`, not `false`.

- [ ] **Step 3: Implement**

In `src/shared/lib/trial.ts`, update the header comment (lines 5-8) to:

```ts
// Booking-block rules (mirrored in DB function shop_can_accept_bookings):
//   - trial expired                                       → no bookings
//   - paid plan + payment_failed > 7 days ago             → no bookings (grace expired)
//   - paid plan + subscription_status = 'none' (lapsed)   → no bookings (no grace period)
//   - everything else                                     → bookings allowed
```

Add `isLapsed: boolean;` to the `TrialState` type (after `cancelledAt: Date | null;`):

```ts
  // Cancellation
  cancelledAt: Date | null;
  // Subscription fully lapsed — cancelled/unpaid plan whose access window ended.
  isLapsed: boolean;
  // Composite gate: should the UI allow new bookings?
  canAcceptBookings: boolean;
```

Update the null-shop default return (inside `if (!shop) { ... }`) to include the new field:

```ts
      paymentFailedGraceExpired: false, cancelledAt: null, isLapsed: false, canAcceptBookings: false,
```

Update the composite gate:

```ts
  // Composite booking gate (matches DB shop_can_accept_bookings exactly)
  const isLapsed = !isTrial && subscriptionStatus === "none";
  let canAcceptBookings: boolean;
  if (isTrial) {
    canAcceptBookings = !isExpired;
  } else if (isLapsed) {
    canAcceptBookings = false;
  } else if (subscriptionStatus === "payment_failed" && paymentFailedAt) {
    canAcceptBookings = inPaymentFailedGrace;
  } else {
    canAcceptBookings = true;
  }
```

Update the final return statement:

```ts
  return {
    isTrial, isExpired, daysLeft, expiresAt, subscriptionStatus,
    paymentFailedAt, inPaymentFailedGrace, paymentFailedDaysLeft, paymentFailedGraceExpired,
    cancelledAt, isLapsed, canAcceptBookings,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/lib/__tests__/trial.test.ts`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS, 237/237 (235 existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/trial.ts src/shared/lib/__tests__/trial.test.ts
git commit -m "fix (billing): getTrialState blocks bookings when subscription is lapsed"
```

---

### Task 3: `TrialBanner.tsx` — lapsed banner case

**Files:**
- Modify: `src/shop/shell/TrialBanner.tsx`
- Modify: `src/shared/lib/translations/en.ts`, `src/shared/lib/translations/nl.ts`

**Interfaces:**
- Consumes: `TrialState.isLapsed` from Task 2.
- Produces: nothing consumed by later tasks — this is leaf UI.

No test file exists for this component (`vitest.config.ts` runs with `environment: "node"`, no jsdom/testing-library in this repo — component behavior here is verified manually, same as the rest of `TrialBanner`/`ShopLayout`). Verification is in Task 6.

- [ ] **Step 1: Add the two translation keys**

In `src/shared/lib/translations/en.ts`, immediately after the `"billing.paymentFailedBlockedSub"` entry (currently line 2116):

```ts
  "billing.lapsedBlockedTitle": "Subscription lapsed — bookings blocked",
  "billing.lapsedBlockedSub":
    "Your plan ended and wasn't renewed. Pick a plan to start accepting appointments again. Existing data stays visible.",
```

In `src/shared/lib/translations/nl.ts`, immediately after the `"billing.paymentFailedBlockedSub"` entry:

```ts
  "billing.lapsedBlockedTitle": "Abonnement verlopen — boekingen geblokkeerd",
  "billing.lapsedBlockedSub":
    "Je plan is beëindigd en niet verlengd. Kies een plan om weer afspraken te kunnen aannemen. Bestaande gegevens blijven zichtbaar.",
```

Also remove the now-confirmed-dead and factually wrong keys from both files — `"billing.cancelledTitle"` and `"billing.cancelledSub"` (grep confirms zero `.tsx`/`.ts` references outside the translation files themselves; the copy claims a cancelled shop "will be moved back to the free trial", which the expiry sweep has never done — it always lands on `plan: starter, subscription_status: none`):

Delete these two lines from `src/shared/lib/translations/en.ts`:
```ts
  "billing.cancelledTitle": "Subscription cancelled",
  "billing.cancelledSub":
    "Your plan stays active until {{date}}. After that you'll be moved back to the free trial.",
```

Delete the matching two lines from `src/shared/lib/translations/nl.ts`:
```ts
  "billing.cancelledTitle": "Abonnement opgezegd",
  "billing.cancelledSub":
    "Je plan blijft actief tot {{date}}. Daarna ga je automatisch terug naar de gratis trial.",
```

- [ ] **Step 2: Add the banner case**

In `src/shop/shell/TrialBanner.tsx`, insert a new case immediately after the `paymentFailedGraceExpired` block (after the closing `}` that follows line 39) and before the `payment_failed` grace-window case:

```tsx
  // 1.5) Subscription fully lapsed (cancelled + expired, or expiry-swept
  // with no reactivation) — no grace period, matches shop_can_accept_bookings.
  if (state.isLapsed) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive shadow-soft">
        <Ban className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("billing.lapsedBlockedTitle")}</p>
          <p className="text-xs opacity-90">{t("billing.lapsedBlockedSub")}</p>
        </div>
        <Link to="/shop/upgrade">
          <Button variant="destructive" size="sm">
            {t("billing.choosePlan")} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }
```

Update the file's top-of-file priority-order comment (lines 9-16) to insert the new case in the list:

```tsx
 * Priority order:
 *   1. payment_failed grace expired → red "boekingen geblokkeerd" banner
 *   1.5. subscription lapsed (none) → red "abonnement verlopen" banner, no grace
 *   2. payment_failed in grace      → orange "betaling mislukt, X dagen" banner
 *   3. trial expired                → red blocking banner
 *   4. trial ≤7 days                → countdown banner
 *   5. cancelled but still active   → neutral info banner with end date
 *   6. else                         → niets
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/shell src/shared/lib/translations`
Expected: no new errors (the pre-existing `plan-checkout.ts` error is outside this path).

- [ ] **Step 4: Commit**

```bash
git add src/shop/shell/TrialBanner.tsx src/shared/lib/translations/en.ts src/shared/lib/translations/nl.ts
git commit -m "feat (billing): show a blocking banner when a subscription has lapsed"
```

---

### Task 4: `ShopLayout.tsx` — redirect away from the dashboard while lapsed

**Files:**
- Modify: `src/shop/shell/ShopLayout.tsx`

**Interfaces:**
- Consumes: `getTrialState` from `@/shared/lib/trial` (Task 2), `TrialState.isLapsed`.
- Produces: nothing consumed elsewhere — leaf behavior.

- [ ] **Step 1: Import `getTrialState`**

At the top of `src/shop/shell/ShopLayout.tsx`, add:

```tsx
import { getTrialState } from "@/shared/lib/trial";
```

- [ ] **Step 2: Compute the lapsed-block condition in `ShopLayoutInner`**

Immediately after the existing `const needsOnboarding = ...` line (currently line 113), add:

```tsx
  const trialState = getTrialState(activeShop as never);
  const LAPSED_ALLOWED_PATHS = ["/shop/upgrade", "/shop/billing", "/support"];
  const lapsedBlocked =
    trialState.isLapsed &&
    !isSuperAdmin &&
    !LAPSED_ALLOWED_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));
```

- [ ] **Step 3: Redirect on the lapsed-blocked condition**

Immediately after the existing `useEffect` for `needsOnboarding` (currently lines 141-145), add a second effect:

```tsx
  useEffect(() => {
    if (!loading && !shopsLoading && !needsOnboarding && lapsedBlocked) {
      navigate({ to: "/shop/upgrade", replace: true });
    }
  }, [lapsedBlocked, needsOnboarding, loading, shopsLoading, navigate]);
```

- [ ] **Step 4: Suppress the flash of blocked content while the redirect fires**

Immediately after the existing `if (needsOnboarding) { return null; }` block (currently lines 151-153), add:

```tsx
  if (lapsedBlocked) {
    return null;
  }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: same single pre-existing `plan-override.ts:54` error, nothing new.

Run: `npx eslint src/shop/shell/ShopLayout.tsx`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/shop/shell/ShopLayout.tsx
git commit -m "fix (billing): redirect lapsed shops away from the dashboard to /shop/upgrade"
```

---

### Task 5: Manual verification + close out the docs

**Files:**
- Modify: `.claude/HANDOFF.md` (§5, §6, §7)
- Modify: `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md` (Results log)

The existing test shop `e643c118-e74c-41fc-a6b3-32fc6707a881` is already sitting at exactly `plan: starter, subscription_status: none` (per `.claude/HANDOFF.md` §3) — the live repro case for this whole fix, no setup needed.

- [ ] **Step 1: Run the full automated check suite once more**

Run: `npm test && npx tsc --noEmit -p tsconfig.json`
Expected: `npm test` passes 237/237; `tsc` shows only the pre-existing `plan-override.ts:54` error.

- [ ] **Step 2: Verify the SQL fix directly against the live shop** (after Task 1's migration has been applied to the Supabase project)

Run (SQL editor or `psql`):
```sql
SELECT public.shop_can_accept_bookings('e643c118-e74c-41fc-a6b3-32fc6707a881');
-- Expected: false (was true before this fix)

SELECT * FROM public.get_shop_feature_access('e643c118-e74c-41fc-a6b3-32fc6707a881', 'sms_reminders');
-- Expected: allowed = false, limit_value = null, used = 0, upgrade_plan = null, current_plan = 'starter'
```

- [ ] **Step 3: Verify the UI manually** (log in as this shop's owner)

- Visiting `/shop` (dashboard) → immediately redirected to `/shop/upgrade`.
- Visiting `/shop/calendar`, `/shop/customers`, etc. → same redirect.
- `/shop/upgrade` and `/shop/billing` load normally, no redirect loop.
- `/shop/upgrade` shows the new "Abonnement verlopen" / lapsed banner via `TrialBanner` at the top.
- Attempting the public booking link for this shop (`/book/<shop-slug>` or however the public flow is reached) → booking creation is rejected (was silently allowed before this fix).
- Logging in as a super admin and visiting this shop's admin detail page / impersonating → NOT redirected (confirms the `isSuperAdmin` bypass in Task 4 works).

- [ ] **Step 4: Update `.claude/HANDOFF.md`**

In §5 ("Known Issues / Bugs"), move the "Access-control gap" item from "Not yet fixed" to a new "Fixed this session" note referencing the migration filename and this plan's path. In §6 ("Remaining Work"), remove item 1 ("Decide the enum/access-control fix"). In §7, replace "Exact Next Step" with whatever the next actual priority is (check with the user — this plan doesn't presume it).

- [ ] **Step 5: Update the QA matrix doc's Results log**

In `docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md`, add a new row to the "Results log" table documenting today's verification (date, shop id last-4 `7881`, what was tested, pass/fail).

- [ ] **Step 6: Commit**

```bash
git add .claude/HANDOFF.md docs/superpowers/plans/2026-08-20-billing-e2e-matrix.md
git commit -m "docs (billing): close out the lapsed-subscription access-control gap"
```

---

## Self-Review

**Spec coverage:**
- Hard block on bookings → Task 1 (`shop_can_accept_bookings`).
- Hard block on gated features → Task 1 (`get_shop_feature_access`).
- No grace period for `'none'` → Task 1, explicit design comment, no grace-day arithmetic added.
- Surgical fix, no new enum → Task 1 uses only the existing `subscription_status` text column.
- Trial shops unaffected → Task 1's branch is unreachable for `plan = 'trial'` (that branch returns earlier); Task 2's `isLapsed` is explicitly gated on `!isTrial`; tested directly.
- Dashboard/UI hard block (redirect, not read-only) → Task 4.
- Super admin bypass → Task 4 Step 2.
- User-visible messaging → Task 3.
- Incorrect "back to free trial" copy → Task 3 Step 1 (deletion).
- Manual QA against the real repro shop → Task 5.

**Placeholder scan:** none found — every step has concrete code or an exact command.

**Type consistency:** `TrialState.isLapsed` (Task 2) is the single field name used by both `TrialBanner.tsx` (Task 3) and `ShopLayout.tsx` (Task 4) — no naming drift.
