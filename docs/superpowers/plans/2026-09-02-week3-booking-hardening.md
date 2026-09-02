# Week 3 Customer Booking Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the real customer booking → deposit payment → confirmation journey: no booking created *through the official public booking flow* ever reaches `confirmed` without verified Mollie payment (or a genuinely deposit-free service), no duplicate payments, no double-bookings, correct shop-timezone display everywhere in the flow, and a confirmation email that actually fires on the real paid path. **Known gap, not closed by this plan:** `checkout.ts` reads `deposit_cents`/`status` off the `bookings` row as written by the anon client at insert time — Supabase RLS on the public insert policy does not independently re-derive or constrain those values server-side, so a request bypassing the official client code (a direct API call) could still insert a booking with `deposit_cents: 0` or `status: 'confirmed'` and skip the deposit/no-Mollie checks entirely. Server-side re-derivation of the deposit amount (via `resolveDepositCents`, already shared by every legitimate call site) plus an RLS-level status/deposit lock is tracked as a **Week 4 follow-up**, not part of this plan.

**Architecture:** Extend the existing dual-Mollie-webhook stack (`mollie-webhook.ts` = platform billing, `connect-webhook.ts` = shop deposit payments) rather than replacing it. Business logic that currently lives inline in handlers gets extracted into pure, side-effect-free `*-decision.ts` modules (mirroring `expiry-sweep-decision.ts` / the existing `mapStatus` pattern) so it can be unit tested without mocks — handlers themselves stay untested, matching the codebase's existing convention. Postgres constraints (exclusion constraint, partial unique index) are the actual correctness guarantees for double-booking and payment idempotency; application-level checks stay only as fast-feedback UX. All new/touched emails go through the current `sendEmail()` DB-template pipeline (Resend) — the legacy `enqueueBookingEmail()` React-component path is not used by anything in this plan.

**Tech Stack:** TanStack Start/Router, Supabase (Postgres RLS + triggers + `pg_cron` + `btree_gist`), Mollie Connect (OAuth, per-shop) + Mollie Platform API (subscriptions, unrelated), Vitest 4, `date-fns-tz`.

**Spec:** This plan implements the Week 3 design reached via `/grill-me` in-session — no separate spec doc; the Global Constraints below are the authoritative decisions.

## Global Constraints

- Money is always integer cents. Percentage deposits round with `Math.round`.
- Test runner: `pnpm test:unit` (`vitest run src`). **No mocking library anywhere in this codebase** — only pure functions get unit tests; handlers/webhooks/UI stay untested by convention (mirrors `mollie-webhook.test.ts`, `expiry-sweep-decision.test.ts`).
- Every new/modified server module uses `createLogger("<domain>")` from `@/server/logger` — never raw `console.*` (existing `checkout.ts` violates this; fixed in Task 8).
- Every material payment/booking-lifecycle event writes to `activity_log`, matching the existing convention: `entity: "payment"` for payment-level events (already used for `payment_failed`, `refunded`), `entity: "booking"` for booking-level events, `entity: "mollie_connect_webhook"` for raw webhook receipt logging (already present, untouched).
- All emails go through `sendEmail({ type, to, data, idempotencyKey })` from `@/email/send-email` (DB-backed `email_templates` table, Resend under the hood) — the legacy `enqueueBookingEmail()` / React-Email-component registry is **not used** anywhere in this plan.
- New scheduled jobs follow the **current** cron pattern from `20260820130000_billing_crons_app_url.sql`: URL built from vault secret `app_url` at schedule time (not hardcoded), auth via vault `cron_secret` (fallback `email_queue_service_role_key`), handler gated by `cronAuthorized(request)` from `@/server/cron-auth`.
- Deposit source of truth: `services.deposit_mode` (`'default' | 'custom'`). `'custom'` → `services.deposit_cents` (0 = explicitly free). `'default'` → computed from the shop's `branding.rules.defaultDepositPct` × `price_cents`. A service "requires a deposit" (and therefore requires the shop to have an active Mollie connection to be publicly bookable) iff its resolved deposit is `> 0`.
- Double-booking: Postgres exclusion constraint on `bookings (staff_id, tstzrange(starts_at, ends_at))` is the real guarantee. The existing `prevent_overlapping_staff_bookings` trigger stays (nice in-transaction error message for the non-race case); `booking-errors.ts` is extended to map the exclusion constraint's `23P01` to the same friendly "conflict" outcome.
- Payment idempotency: partial unique index `payments (booking_id) WHERE status = 'unpaid'` is the real guarantee. `checkout.ts` checks for an existing unpaid payment before creating a new Mollie payment, and handles the `23505` race by re-fetching and replaying the winner's checkout URL.
- Abandoned pending bookings: TTL-based cron sweep (not just relying on Mollie's own `expired` webhook). Expiry cancels the booking, fails its payment, and sends the customer the existing `booking-payment-failed` template with a retry link (client's call — no separate "expired" copy).
- Timezone bugs fixed in this plan: (1) confirmation-email "when" formatting used the *server's* local tz — now shop tz via `formatInShopTz`; (2) `sendPaymentFailedEmail`'s "when" formatting, same bug, same fix; (3) `PublicBookingFlow.tsx`'s 90-day max-bookable-date check used the *browser's* local date — now shop-local via `shopTodayYmd`. Admin/staff-side calendar timezone bugs are explicitly **out of scope** (tracked separately per prior agreement).
- No-Mollie-connected behavior: blocks only the specific deposit-requiring service (not the shop's whole public page). A new narrow `public_shop_mollie_connected(_shop_id)` SECURITY DEFINER RPC (returns only a boolean, no token data) lets the client gray out affected services; `checkout.ts` remains the authoritative server-side block (never trust the client) and now **cancels** the already-inserted pending booking rather than silently auto-confirming it unpaid.
- **Human review gate:** agent writes migration SQL but does NOT apply it. Human reviews, runs migration, confirms before continuing to any task that depends on the applied schema.
- E2E/whole-flow testing is explicitly **out of scope for this plan** — the user is doing that separately. This plan's testing surface is unit tests for every pure decision module it introduces or touches.
- **Deploy order (added after final review — read before shipping):** the `services.deposit_mode` migration (`20260902120000_week3_deposit_mode.sql`) MUST be applied *before* this code is deployed, not after. Until that migration lands, `services` rows have no `deposit_mode` column at runtime; the client-side `toDepositMode()` helper defaults any missing/unrecognized value to `"default"`, which means every service would silently charge the shop's default percentage instead of its actual configured deposit amount for however long the gap lasts. Correct release order: (1) apply `20260902120000_week3_deposit_mode.sql` and confirm the backfill (`UPDATE ... SET deposit_mode = 'custom'`) ran against all existing rows, (2) deploy the code, (3) apply the remaining five migrations, (4) schedule the `booking-expiry-sweep` cron **last**, only after confirming the sweep's payment-linked filter (added in the final-review fix wave) is live — do not schedule the cron against code that still has the unfiltered "cancel every pending booking" behavior.

---

## File Map

| Area | Create | Modify |
|---|---|---|
| Webhook auth | `src/shared/lib/webhook-auth.ts` + test | `src/shop/payments/server/mollie-webhook.ts`, `src/shop/payments/server/connect-webhook.ts`, `src/booking/server/checkout.ts` |
| Mollie status mapping | `src/shop/payments/mollie-status.ts` + test | `src/shop/payments/server/mollie-webhook.ts`, `src/shop/payments/server/connect-webhook.ts` |
| Deposit model | `src/shared/lib/booking-rules.ts` + test, `src/booking/lib/deposit-decision.ts` + test | `src/shop/services/ServicesPage.tsx`, `src/shop/notifications/NotificationsPage.tsx`, `src/booking/server/checkout.ts`, `src/booking/components/PublicBookingFlow.tsx` |
| No-Mollie blocking | migration (RPC) | `src/booking/server/checkout.ts`, `src/booking/components/PublicBookingFlow.tsx` |
| Payment idempotency | migration (unique index) | `src/booking/server/checkout.ts` |
| Double-booking | migration (`btree_gist` + exclusion constraint) | `src/booking/lib/booking-errors.ts` + new test |
| Email templates | migration (seed `email_templates`) | — |
| Confirmation email | — | `src/email/server/booking-confirmation.ts`, `src/shop/payments/server/connect-webhook.ts` |
| Pending-booking TTL sweep | `src/booking/server/booking-expiry-decision.ts` + test, `src/booking/server/booking-expiry.ts`, `src/routes/hooks/booking-expiry.ts`, migration (cron schedule) | — |
| Confirmation page / retry | — | `src/booking/pages/ConfirmationPage.tsx`, `src/booking/components/PublicBookingFlow.tsx` |
| Balance display | — | `src/shop/calendar/ShopCalendarPage.tsx` |

---

### Task 1: Shared webhook-token verification

**Files:**
- Create: `src/shared/lib/webhook-auth.ts`
- Test: `src/shared/lib/__tests__/webhook-auth.test.ts`

**Interfaces:**
- Produces: `safeEqualStrings(a: string, b: string): boolean`, `verifyWebhookToken(providedToken: string | null | undefined, expectedSecret: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/__tests__/webhook-auth.test.ts
import { describe, expect, test } from "vitest";
import { safeEqualStrings, verifyWebhookToken } from "@/shared/lib/webhook-auth";

describe("safeEqualStrings", () => {
  test("equal strings", () => {
    expect(safeEqualStrings("abc123", "abc123")).toBe(true);
  });
  test("different strings, same length", () => {
    expect(safeEqualStrings("abc123", "abc124")).toBe(false);
  });
  test("different length", () => {
    expect(safeEqualStrings("abc", "abcd")).toBe(false);
  });
  test("both empty", () => {
    expect(safeEqualStrings("", "")).toBe(true);
  });
});

describe("verifyWebhookToken", () => {
  test("no secret configured — check disabled, always passes", () => {
    expect(verifyWebhookToken(null, undefined)).toBe(true);
    expect(verifyWebhookToken("anything", "")).toBe(true);
  });
  test("secret configured, matching token", () => {
    expect(verifyWebhookToken("s3cr3t", "s3cr3t")).toBe(true);
  });
  test("secret configured, mismatched token", () => {
    expect(verifyWebhookToken("wrong", "s3cr3t")).toBe(false);
  });
  test("secret configured, no token provided", () => {
    expect(verifyWebhookToken(null, "s3cr3t")).toBe(false);
    expect(verifyWebhookToken(undefined, "s3cr3t")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/lib/__tests__/webhook-auth.test.ts`
Expected: FAIL — `Cannot find module '@/shared/lib/webhook-auth'`

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/lib/webhook-auth.ts
// Shared shared-secret verification for inbound webhooks (Mollie does not sign
// webhook bodies). A query-string `token` or `x-webhook-token` header is
// compared against a server-configured secret. Used by both the platform
// Mollie webhook and the Mollie Connect (shop deposit) webhook.

export function safeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Returns true when the request is authorized to call the webhook.
 * If no `expectedSecret` is configured, the check is disabled (returns true) —
 * matches the existing opt-in behavior of MOLLIE_WEBHOOK_SECRET.
 */
export function verifyWebhookToken(
  providedToken: string | null | undefined,
  expectedSecret: string | null | undefined,
): boolean {
  if (!expectedSecret) return true;
  if (!providedToken) return false;
  return safeEqualStrings(providedToken, expectedSecret);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/lib/__tests__/webhook-auth.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/webhook-auth.ts src/shared/lib/__tests__/webhook-auth.test.ts
git commit -m "feat(webhooks): extract shared webhook-token verification"
```

---

### Task 2: Shared Mollie status mapping

**Files:**
- Create: `src/shop/payments/mollie-status.ts`
- Test: `src/shop/payments/__tests__/mollie-status.test.ts`
- Modify: `src/shop/payments/server/mollie-webhook.ts:266-276`, `src/shop/payments/server/connect-webhook.ts:150-156`

**Interfaces:**
- Produces: `type MollieRawStatus`, `mapMollieStatus(s: MollieRawStatus | undefined | null): "paid" | "failed" | "unpaid" | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/shop/payments/__tests__/mollie-status.test.ts
import { describe, expect, test } from "vitest";
import { mapMollieStatus } from "@/shop/payments/mollie-status";

describe("mapMollieStatus", () => {
  test.each([
    ["paid", "paid"],
    ["authorized", "paid"],
    ["failed", "failed"],
    ["canceled", "failed"],
    ["expired", "failed"],
    ["open", "unpaid"],
    ["pending", "unpaid"],
    [undefined, null],
    [null, null],
  ] as const)("mapMollieStatus(%s) === %s", (input, expected) => {
    expect(mapMollieStatus(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shop/payments/__tests__/mollie-status.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/shop/payments/mollie-status.ts
// Shared Mollie payment-status → local-status mapping. Both the platform
// billing webhook (mollie-webhook.ts) and the shop deposit webhook
// (connect-webhook.ts) previously duplicated this identically.

export type MollieRawStatus =
  | "open"
  | "pending"
  | "paid"
  | "canceled"
  | "expired"
  | "failed"
  | "authorized";

export function mapMollieStatus(
  s: MollieRawStatus | undefined | null,
): "paid" | "failed" | "unpaid" | null {
  if (!s) return null;
  if (s === "paid" || s === "authorized") return "paid";
  if (s === "failed" || s === "canceled" || s === "expired") return "failed";
  if (s === "open" || s === "pending") return "unpaid";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shop/payments/__tests__/mollie-status.test.ts`
Expected: PASS (9 cases)

- [ ] **Step 5: Wire `mollie-webhook.ts` to the shared function, keep its export name stable**

In `src/shop/payments/server/mollie-webhook.ts`, replace the local `mapStatus` function (lines 266-276) with an import + re-export so the existing `mollie-webhook.test.ts` (which imports `mapStatus` from this file) keeps passing unchanged:

```ts
// near the top imports of mollie-webhook.ts
import { mapMollieStatus } from "@/shop/payments/mollie-status";

// replace the old `export function mapStatus(...) { ... }` block with:
export { mapMollieStatus as mapStatus };
```

- [ ] **Step 6: Wire `connect-webhook.ts` to the shared function**

In `src/shop/payments/server/connect-webhook.ts`, delete the local `mapStatus` function (lines 150-156) and its now-redundant `MolliePayment["status"]` literal union duplication; import the shared one instead:

```ts
import { mapMollieStatus, type MollieRawStatus } from "@/shop/payments/mollie-status";

type MolliePayment = {
  id: string;
  status: MollieRawStatus;
  method?: string | null;
  metadata?: Record<string, unknown> | null;
};
```

Replace every call site `mapStatus(mollie?.status)` in this file with `mapMollieStatus(mollie?.status)`.

- [ ] **Step 7: Run the full unit suite to confirm nothing broke**

Run: `pnpm test:unit`
Expected: PASS — `mollie-webhook.test.ts` still passes against the re-exported `mapStatus`.

- [ ] **Step 8: Commit**

```bash
git add src/shop/payments/mollie-status.ts src/shop/payments/__tests__/mollie-status.test.ts src/shop/payments/server/mollie-webhook.ts src/shop/payments/server/connect-webhook.ts
git commit -m "refactor(payments): extract shared Mollie status mapping, remove duplication"
```

---

### Task 3: Apply webhook-token verification to the deposit webhook

**Files:**
- Modify: `src/shop/payments/server/mollie-webhook.ts` (replace inline check with shared helper), `src/shop/payments/server/connect-webhook.ts` (add the check, currently has none), `src/booking/server/checkout.ts:146-148` (embed the token when building `webhookUrl`)

**Interfaces:**
- Consumes: `verifyWebhookToken` from Task 1

- [ ] **Step 1: Replace `mollie-webhook.ts`'s inline secret check with the shared helper**

`mollie-webhook.ts` currently has its own `safeEqual` (lines 257-264) and inline extraction/comparison (lines 88-102). Replace the comparison call:

```ts
import { verifyWebhookToken } from "@/shared/lib/webhook-auth";

// inside POST handler, replace the `if (!safeEqual(provided, expectedSecret))` block with:
if (!verifyWebhookToken(provided, expectedSecret)) {
  log.warn("rejected_invalid_or_missing_token");
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
```

Delete the now-unused local `safeEqual` function (lines 257-264).

- [ ] **Step 2: Add the same check to `connect-webhook.ts` (currently has none)**

At the top of the `POST` handler in `src/shop/payments/server/connect-webhook.ts`, before any body parsing:

```ts
import { verifyWebhookToken } from "@/shared/lib/webhook-auth";
import { serverEnv } from "@/server/env";

// first lines inside POST handler's try block:
const expectedSecret = serverEnv("MOLLIE_WEBHOOK_SECRET");
if (expectedSecret) {
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
  if (!verifyWebhookToken(provided, expectedSecret)) {
    log.warn("rejected_invalid_or_missing_token");
    return json({ error: "unauthorized" }, 401);
  }
}
```

- [ ] **Step 3: Have `checkout.ts` embed the token in the webhook URL it hands Mollie**

In `src/booking/server/checkout.ts`, the `webhookUrl` is built at line 148 (`const webhookUrl = \`${origin}/api/mollie-connect/webhook\`;`). Append the token when configured:

```ts
import { serverEnv } from "@/server/env";

// replace the single webhookUrl line with:
const webhookSecret = serverEnv("MOLLIE_WEBHOOK_SECRET");
const webhookUrl = webhookSecret
  ? `${origin}/api/mollie-connect/webhook?token=${encodeURIComponent(webhookSecret)}`
  : `${origin}/api/mollie-connect/webhook`;
```

- [ ] **Step 4: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shop/payments/server/mollie-webhook.ts src/shop/payments/server/connect-webhook.ts src/booking/server/checkout.ts
git commit -m "fix(payments): authenticate the deposit-payment webhook (was unauthenticated)"
```

---

### Task 4: Shared shop default-deposit-percent resolver

**Files:**
- Create: `src/shared/lib/booking-rules.ts`
- Test: `src/shared/lib/__tests__/booking-rules.test.ts`

**Interfaces:**
- Produces: `DEFAULT_DEPOSIT_PERCENT = 20`, `resolveShopDefaultDepositPercent(branding: unknown): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/__tests__/booking-rules.test.ts
import { describe, expect, test } from "vitest";
import { DEFAULT_DEPOSIT_PERCENT, resolveShopDefaultDepositPercent } from "@/shared/lib/booking-rules";

describe("resolveShopDefaultDepositPercent", () => {
  test("missing branding falls back to the default", () => {
    expect(resolveShopDefaultDepositPercent(null)).toBe(DEFAULT_DEPOSIT_PERCENT);
    expect(resolveShopDefaultDepositPercent(undefined)).toBe(DEFAULT_DEPOSIT_PERCENT);
    expect(resolveShopDefaultDepositPercent({})).toBe(DEFAULT_DEPOSIT_PERCENT);
  });
  test("reads branding.rules.defaultDepositPct when present", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: 35 } })).toBe(35);
  });
  test("clamps below 0 to 0", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: -5 } })).toBe(0);
  });
  test("clamps above 100 to 100", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: 150 } })).toBe(100);
  });
  test("non-numeric value falls back to the default", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: "abc" } })).toBe(DEFAULT_DEPOSIT_PERCENT);
  });
  test("explicit 0 is respected, not treated as missing", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: 0 } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/lib/__tests__/booking-rules.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/lib/booking-rules.ts
// Single source of truth for the shop-wide default deposit percentage, shared
// between the Settings UI (branding.rules.defaultDepositPct) and the server
// (checkout.ts / deposit-decision.ts). Without this, the UI's fallback and the
// server's fallback could silently disagree for a shop that never saved.

export const DEFAULT_DEPOSIT_PERCENT = 20;

export function resolveShopDefaultDepositPercent(branding: unknown): number {
  if (!branding || typeof branding !== "object") return DEFAULT_DEPOSIT_PERCENT;
  const rules = (branding as Record<string, unknown>).rules;
  if (!rules || typeof rules !== "object") return DEFAULT_DEPOSIT_PERCENT;
  const raw = (rules as Record<string, unknown>).defaultDepositPct;
  if (typeof raw !== "number" || Number.isNaN(raw)) return DEFAULT_DEPOSIT_PERCENT;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/lib/__tests__/booking-rules.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Point `SettingsPage.tsx`'s `DEFAULT_RULES` at the same constant**

In `src/shop/settings/SettingsPage.tsx`, import `DEFAULT_DEPOSIT_PERCENT` and use it in `DEFAULT_RULES` (line 39) instead of the inline literal `20`:

```ts
import { DEFAULT_DEPOSIT_PERCENT } from "@/shared/lib/booking-rules";

const DEFAULT_RULES: BookingRules = { minNoticeHours: 2, maxWindowDays: 60, slotIntervalMin: 15, defaultDepositPct: DEFAULT_DEPOSIT_PERCENT };
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/booking-rules.ts src/shared/lib/__tests__/booking-rules.test.ts src/shop/settings/SettingsPage.tsx
git commit -m "feat(booking): shared default-deposit-percent resolver, single source of truth"
```

---

### Task 5: Deposit calculation decision module

**Files:**
- Create: `src/booking/lib/deposit-decision.ts` (client-importable — not under `server/`, used by both `checkout.ts` and `PublicBookingFlow.tsx`)
- Test: `src/booking/lib/__tests__/deposit-decision.test.ts`

**Interfaces:**
- Consumes: nothing (pure)
- Produces: `type DepositService = { deposit_mode: "default" | "custom"; deposit_cents: number; price_cents: number }`, `resolveDepositCents(service, defaultDepositPercent: number): number`, `serviceRequiresDeposit(service, defaultDepositPercent: number): boolean`, `serviceRequiresMollie(service, defaultDepositPercent: number): boolean` (alias of `serviceRequiresDeposit` today — kept as a separate export since the two concerns could diverge later, e.g. a non-Mollie payment provider)

- [ ] **Step 1: Write the failing test**

```ts
// src/booking/lib/__tests__/deposit-decision.test.ts
import { describe, expect, test } from "vitest";
import {
  resolveDepositCents,
  serviceRequiresDeposit,
  serviceRequiresMollie,
  type DepositService,
} from "@/booking/lib/deposit-decision";

describe("resolveDepositCents", () => {
  test("custom mode uses deposit_cents directly", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: 1500, price_cents: 5000 };
    expect(resolveDepositCents(service, 20)).toBe(1500);
  });
  test("custom mode with 0 means explicitly free, ignores shop default", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: 0, price_cents: 5000 };
    expect(resolveDepositCents(service, 20)).toBe(0);
  });
  test("default mode computes percent of price", () => {
    const service: DepositService = { deposit_mode: "default", deposit_cents: 0, price_cents: 5000 };
    expect(resolveDepositCents(service, 20)).toBe(1000);
  });
  test("default mode with 0% shop default resolves to 0", () => {
    const service: DepositService = { deposit_mode: "default", deposit_cents: 0, price_cents: 5000 };
    expect(resolveDepositCents(service, 0)).toBe(0);
  });
  test("default mode rounds to the nearest cent", () => {
    const service: DepositService = { deposit_mode: "default", deposit_cents: 0, price_cents: 999 };
    // 999 * 15 / 100 = 149.85 -> rounds to 150
    expect(resolveDepositCents(service, 15)).toBe(150);
  });
  test("negative custom deposit_cents floors to 0 (defensive)", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: -5, price_cents: 5000 };
    expect(resolveDepositCents(service, 20)).toBe(0);
  });
});

describe("serviceRequiresDeposit / serviceRequiresMollie", () => {
  test("true when resolved deposit is positive", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: 500, price_cents: 5000 };
    expect(serviceRequiresDeposit(service, 20)).toBe(true);
    expect(serviceRequiresMollie(service, 20)).toBe(true);
  });
  test("false when resolved deposit is 0", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: 0, price_cents: 5000 };
    expect(serviceRequiresDeposit(service, 20)).toBe(false);
    expect(serviceRequiresMollie(service, 20)).toBe(false);
  });
  test("default-mode service with 0% shop default does not require a deposit", () => {
    const service: DepositService = { deposit_mode: "default", deposit_cents: 0, price_cents: 5000 };
    expect(serviceRequiresDeposit(service, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/booking/lib/__tests__/deposit-decision.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/booking/lib/deposit-decision.ts
// Pure deposit-calculation logic, shared between the public booking client
// (PublicBookingFlow.tsx) and the server checkout endpoint (checkout.ts).
// Deliberately has no I/O — callers resolve `defaultDepositPercent` via
// resolveShopDefaultDepositPercent() before calling in here.

export type DepositService = {
  deposit_mode: "default" | "custom";
  deposit_cents: number;
  price_cents: number;
};

export function resolveDepositCents(service: DepositService, defaultDepositPercent: number): number {
  if (service.deposit_mode === "custom") {
    return Math.max(0, service.deposit_cents);
  }
  const pct = Math.max(0, Math.min(100, defaultDepositPercent));
  return Math.round((service.price_cents * pct) / 100);
}

export function serviceRequiresDeposit(service: DepositService, defaultDepositPercent: number): boolean {
  return resolveDepositCents(service, defaultDepositPercent) > 0;
}

/** Alias today; kept separate in case a non-Mollie payment provider is ever added. */
export function serviceRequiresMollie(service: DepositService, defaultDepositPercent: number): boolean {
  return serviceRequiresDeposit(service, defaultDepositPercent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/booking/lib/__tests__/deposit-decision.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/booking/lib/deposit-decision.ts src/booking/lib/__tests__/deposit-decision.test.ts
git commit -m "feat(booking): pure deposit-calculation decision module"
```

---

### Task 6: Deposit mode schema, per-service toggle UI, remove duplicate Notifications control

**Files:**
- Create: `supabase/migrations/20260902120000_week3_deposit_mode.sql`
- Modify: `src/shop/services/ServicesPage.tsx:326,338-346,353-370` (form state + save payload + validation), `src/shop/notifications/NotificationsPage.tsx:242,255-311` (remove `DepositSettings`)

**Interfaces:**
- Produces: `services.deposit_mode` column, values `'default' | 'custom'`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260902120000_week3_deposit_mode.sql
-- Per-service deposit override toggle. 'custom' = use services.deposit_cents
-- directly (0 = explicitly free). 'default' = compute from the shop's
-- branding.rules.defaultDepositPct at booking time (see deposit-decision.ts).
--
-- Backfill: ALL existing services get 'custom' with their current deposit_cents
-- preserved exactly — zero behavior change for shops already live. Only
-- services created AFTER this migration default to 'default', nudging new
-- setups toward the shop-wide-percent flow.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS deposit_mode TEXT NOT NULL DEFAULT 'default'
    CHECK (deposit_mode IN ('default', 'custom'));

UPDATE public.services SET deposit_mode = 'custom';
```

**⚠️ Human review gate — do not apply this migration until a human has reviewed and run it.**

- [ ] **Step 2: Apply the migration (human)**

Human runs the migration against the target Supabase project and confirms before continuing.

- [ ] **Step 3: Add the mode toggle to the service form**

In `src/shop/services/ServicesPage.tsx`, extend the form state (line 326) to carry `deposit_mode`:

```ts
const [form, setForm] = useState({ name: "", category: "", duration_minutes: 30, price: 0, deposit: 0, deposit_mode: "default" as "default" | "custom", is_active: true, description: "" });
```

Seed it from the loaded/duplicated row (inside the `useEffect` around lines 338-346):

```ts
setForm({
  name: duplicateOf ? t("services.copyOf", { name: duplicateOf.name }) : seed?.name ?? "",
  category: seed?.category ?? "",
  duration_minutes: seed?.duration_minutes ?? 30,
  price: seed ? seed.price_cents / 100 : 0,
  deposit: seed ? seed.deposit_cents / 100 : 0,
  deposit_mode: seed?.deposit_mode ?? "default",
  is_active: seed?.is_active ?? true,
  description: seed?.description ?? "",
});
```

Update validation (lines 353-363) — the amount field/error only applies in `'custom'` mode:

```ts
const priceNum = Number(form.price) || 0;
const depositNum = Number(form.deposit) || 0;
const priceError = priceNum < 0 ? t("services.priceNegative") : null;
const depositError =
  form.deposit_mode === "custom"
    ? depositNum < 0
      ? t("services.depositNegative")
      : depositNum > priceNum
        ? t("services.depositTooHigh")
        : null
    : null;
const hasErrors = !!priceError || !!depositError;
```

Update the save payload (line 370) to include `deposit_mode`, and zero out `deposit_cents` in `'default'` mode so the stored amount never goes stale relative to the live shop percent:

```ts
const payload = {
  shop_id: shopId,
  name: form.name.trim(),
  category: form.category.trim() || null,
  description: form.description.trim() || null,
  duration_minutes: Number(form.duration_minutes) || 30,
  price_cents: Math.round(priceNum * 100),
  deposit_cents: form.deposit_mode === "custom" ? Math.round(depositNum * 100) : 0,
  deposit_mode: form.deposit_mode,
  is_active: form.is_active,
};
```

Add the toggle control itself in the form JSX, near the existing deposit amount input (a simple two-option radio/segmented control bound to `form.deposit_mode`, showing the amount input only when `form.deposit_mode === "custom"`; when `"default"` is selected, show a short note referencing the shop's current default percent). Exact JSX/markup follows this file's existing radio/segmented-control patterns elsewhere in the same form — no new UI primitive needed.

- [ ] **Step 4: Remove the duplicate Notifications-page deposit control**

In `src/shop/notifications/NotificationsPage.tsx`:
- Delete the call site at line 242: `<DepositSettings shopId={shopId} shop={shop ?? null} />`
- Delete the entire `DepositSettings` function, lines 255-311.
- Leave the `shops.default_deposit_percent` DB column in place (unused, harmless) — dropping it is out of scope for this plan.

- [ ] **Step 5: Manual verification**

Run the dev server, open Services → create a service, confirm the toggle defaults to "shop default %", switching to "custom amount" reveals the amount field, and saving persists `deposit_mode` correctly. Open Notifications and confirm the old "Deposit" card is gone.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902120000_week3_deposit_mode.sql src/shop/services/ServicesPage.tsx src/shop/notifications/NotificationsPage.tsx
git commit -m "feat(services): per-service deposit mode (shop default % vs custom amount)"
```

---

### Task 7: Public Mollie-connected check + per-service no-Mollie blocking

**Files:**
- Create: `supabase/migrations/20260902121500_public_shop_mollie_connected.sql`
- Modify: `src/booking/server/checkout.ts:39-69` (replace the silent auto-confirm fallback), `src/booking/components/PublicBookingFlow.tsx` (service-picker gating + willChargeDeposit/depositDue computation)

**Interfaces:**
- Consumes: `serviceRequiresMollie`, `resolveDepositCents` (Task 5), `resolveShopDefaultDepositPercent` (Task 4)
- Produces: `public_shop_mollie_connected(_shop_id uuid) RETURNS boolean` RPC

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260902121500_public_shop_mollie_connected.sql
-- Narrow public-safe boolean so the anon booking client can gray out
-- deposit-requiring services without ever seeing shop_payment_providers'
-- encrypted token columns.

CREATE OR REPLACE FUNCTION public.public_shop_mollie_connected(_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_payment_providers
    WHERE shop_id = _shop_id
      AND provider = 'mollie'
      AND connection_status = 'connected'
  );
$$;

GRANT EXECUTE ON FUNCTION public.public_shop_mollie_connected(uuid) TO anon, authenticated;
```

**⚠️ Human review gate — do not apply until a human has reviewed and run it.**

- [ ] **Step 2: Apply the migration (human)**

- [ ] **Step 3: Rework `checkout.ts`'s no-deposit / no-Mollie branches**

Replace lines 39-69 of `src/booking/server/checkout.ts` (the `confirmBookingIfPending` no-op-when-already-confirmed helper stays; the two `if` branches following it change):

```ts
import { createLogger } from "@/server/logger";
import { resolveDepositCents } from "@/booking/lib/deposit-decision";
import { resolveShopDefaultDepositPercent } from "@/shared/lib/booking-rules";

const log = createLogger("bookings.checkout");

async function confirmBookingIfPending(bookingId: string, currentStatus: string) {
  if (currentStatus === "confirmed") return;
  await supabaseAdmin
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", bookingId)
    .eq("status", "pending");
}

async function cancelBookingNoMollie(bookingId: string, shopId: string) {
  await supabaseAdmin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("status", "pending");
  await supabaseAdmin.from("activity_log").insert({
    entity: "booking",
    action: "blocked_no_mollie_connection",
    shop_id: shopId,
    metadata: { booking_id: bookingId },
  });
  log.warn("blocked_no_mollie_connection", { booking_id: bookingId, shop_id: shopId });
}
```

Inside the `POST` handler, `booking.deposit_cents` is already the frozen amount computed at insert time (Task 9/PublicBookingFlow.tsx wiring below still writes the resolved `deposit_cents` onto the row) — the branch logic changes to:

```ts
// Skip when there's nothing to charge — confirm server-side (anon cannot UPDATE bookings).
if (!booking.deposit_cents || booking.deposit_cents <= 0) {
  await confirmBookingIfPending(booking.id, booking.status);
  return json({ ok: true, skipped: true, reason: "no_deposit" });
}

// Resolve a usable (decrypted, refreshed-if-needed) access token.
const tokenInfo = await getActiveMollieAccessToken(booking.shop_id);
if (!tokenInfo) {
  // A deposit IS required but the shop has no working Mollie connection —
  // this is a shop misconfiguration, not something to silently absorb as a
  // free confirmed booking. Cancel it; the customer sees an error and the
  // slot is released for someone else.
  await cancelBookingNoMollie(booking.id, booking.shop_id);
  return json({ error: "mollie_not_connected" }, 409);
}
```

- [ ] **Step 4: Have `PublicBookingFlow.tsx` gray out deposit-requiring services when Mollie isn't connected**

Add a query for the new RPC alongside the shop query (near where `selectedShop` is resolved):

```ts
const { data: mollieConnected = true } = useQuery({
  queryKey: ["public", "shop-mollie-connected", selectedShop?.id],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("public_shop_mollie_connected", { _shop_id: selectedShop!.id });
    if (error) throw error;
    return data ?? false;
  },
  enabled: !!selectedShop?.id,
});
```

In the service list rendering, compute per-service whether it's blocked and disable selection with an inline note:

```ts
const defaultDepositPercent = resolveShopDefaultDepositPercent(selectedShop?.branding);
// ...inside the service map:
const requiresMollie = !isDemoShop && serviceRequiresMollie(service, defaultDepositPercent);
const blocked = requiresMollie && !mollieConnected;
// render `service` as disabled with a short "temporarily unavailable" note when `blocked` is true
```

- [ ] **Step 5: Have booking creation compute and freeze the resolved deposit via the shared module**

Replace the inline `willChargeDeposit`/`depositDue` computation (currently `selectedService.deposit_cents > 0`) with the shared resolver, and write the resolved amount onto the inserted row instead of the raw `services.deposit_cents`:

```ts
const defaultDepositPercent = resolveShopDefaultDepositPercent(selectedShop?.branding);
const resolvedDepositCents = resolveDepositCents(selectedService, defaultDepositPercent);
const willChargeDeposit = !isDemoShop && resolvedDepositCents > 0;
const bookingStatus: "pending" | "confirmed" = willChargeDeposit ? "pending" : "confirmed";

const { data: booking, error: bErr } = await supabase
  .from("bookings")
  .insert({
    // ...unchanged fields...
    deposit_cents: resolvedDepositCents,
    // ...
  })
  .select("id").single();
```

and the `depositDue`/demo-payment block below it uses `resolvedDepositCents` in place of `selectedService.deposit_cents`. Also surface a friendly error on the `mollie_not_connected` response from `checkout.ts` instead of the current silent `console.warn`-and-continue:

```ts
if (res.status === 409 && data?.error === "mollie_not_connected") {
  toast.error(t("book.mollieNotConnected"));
  setStep(presetShopId ? 2 : 3);
  return;
}
```

- [ ] **Step 6: Manual verification**

With a shop that has no Mollie connection and a deposit-requiring service: confirm the service shows as unavailable in the picker, and (bypassing the client check, e.g. via direct API call) confirm `checkout.ts` returns `409 mollie_not_connected` and the booking row ends up `cancelled`, not `confirmed`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260902121500_public_shop_mollie_connected.sql src/booking/server/checkout.ts src/booking/components/PublicBookingFlow.tsx
git commit -m "fix(booking): block deposit-required services when Mollie isn't connected (was silent zero-payment auto-confirm)"
```

---

### Task 8: Payment creation idempotency

**Files:**
- Create: `supabase/migrations/20260902123000_payments_one_open_per_booking.sql`
- Modify: `src/booking/server/checkout.ts` (payment-insert section, ~lines 123-144)

**Interfaces:**
- Consumes: `createLogger` (already wired in Task 7)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260902123000_payments_one_open_per_booking.sql
-- Idempotency guarantee: at most one *open* (unpaid) payment per booking.
-- Prevents a double-click or a client retry on POST /api/bookings/checkout
-- from creating two live Mollie payments for the same booking.

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_open_per_booking_uniq
  ON public.payments (booking_id)
  WHERE status = 'unpaid' AND booking_id IS NOT NULL;
```

**⚠️ Human review gate — do not apply until a human has reviewed and run it.**

- [ ] **Step 2: Apply the migration (human)**

- [ ] **Step 3: Check for an existing open payment before creating a new one**

In `src/booking/server/checkout.ts`, immediately after the Mollie-connection check (Task 7's `tokenInfo` block) and before the fee/provider lookups, add a replay check:

```ts
// Idempotent replay: if this booking already has an open (unpaid) payment
// with a live Mollie checkout, hand back the SAME checkout URL instead of
// creating a second Mollie payment.
const { data: existingPayment } = await supabaseAdmin
  .from("payments")
  .select("id, provider_payment_id, metadata")
  .eq("booking_id", booking.id)
  .eq("status", "unpaid")
  .maybeSingle();

if (existingPayment?.provider_payment_id) {
  const existingCheckoutUrl =
    (existingPayment.metadata as Record<string, unknown> | null)?.checkout_url as string | undefined;
  if (existingCheckoutUrl) {
    log.info("replayed_existing_checkout", { booking_id: booking.id, payment_id: existingPayment.id });
    return json({ ok: true, payment_id: existingPayment.id, checkout_url: existingCheckoutUrl });
  }
}
```

Store `checkout_url` into `metadata` when the Mollie payment is created (currently only `provider_payment_id` is persisted after creation, around line 203-206) so the replay path above can find it:

```ts
const checkoutUrl = mollie._links?.checkout?.href ?? redirectUrl;
await supabaseAdmin
  .from("payments")
  .update({
    provider_payment_id: mollie.id,
    metadata: {
      kind: "booking_deposit",
      booking_fee_cents: bookingFeeCents,
      plan: shop?.plan ?? null,
      fee_model: "fixed_per_booking",
      checkout_url: checkoutUrl,
    },
  })
  .eq("id", payment.id);

await supabaseAdmin.from("activity_log").insert({
  entity: "payment",
  action: "checkout_created",
  shop_id: booking.shop_id,
  metadata: { payment_id: payment.id, booking_id: booking.id, amount_cents: amountCents },
});

return json({ ok: true, payment_id: payment.id, checkout_url: checkoutUrl });
```

- [ ] **Step 4: Handle the concurrent-insert race (`23505`) on the payment insert**

Wrap the existing payment-insert block (lines 123-144) to catch the unique-violation race — two simultaneous requests both pass the `existingPayment` check above before either commits:

```ts
const { data: payment, error: payErr } = await supabaseAdmin
  .from("payments")
  .insert({ /* ...unchanged... */ })
  .select("id")
  .single();

if (payErr?.code === "23505") {
  // Lost the race — another concurrent request already created the open
  // payment for this booking. Re-fetch and replay its checkout URL.
  const { data: winner } = await supabaseAdmin
    .from("payments")
    .select("id, provider_payment_id, metadata")
    .eq("booking_id", booking.id)
    .eq("status", "unpaid")
    .maybeSingle();
  const winnerUrl = (winner?.metadata as Record<string, unknown> | null)?.checkout_url as string | undefined;
  if (winner && winnerUrl) {
    log.info("race_lost_replayed_winner", { booking_id: booking.id, payment_id: winner.id });
    return json({ ok: true, payment_id: winner.id, checkout_url: winnerUrl });
  }
  // Winner hasn't reached the Mollie-create step yet (metadata.checkout_url
  // not set) — ask the client to retry shortly rather than double-create.
  return json({ error: "checkout_in_progress" }, 409);
}
if (payErr || !payment) {
  log.error("payment_insert_failed", { booking_id: booking.id, err: payErr?.message });
  return json({ error: "payment_insert_failed", details: payErr?.message }, 500);
}
```

- [ ] **Step 5: Manual verification**

Fire two concurrent `POST /api/bookings/checkout` requests for the same `booking_id` (e.g. via two parallel `curl`s) and confirm only one `payments` row with `status = 'unpaid'` exists afterward, and both responses resolve to the same `checkout_url` (or the second gets `409 checkout_in_progress` if it raced ahead of the first reaching Mollie).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902123000_payments_one_open_per_booking.sql src/booking/server/checkout.ts
git commit -m "fix(payments): idempotent checkout creation, prevent duplicate Mollie payments per booking"
```

---

### Task 9: Double-booking exclusion constraint

**Files:**
- Create: `supabase/migrations/20260902124500_bookings_exclusion_constraint.sql`
- Modify: `src/booking/lib/booking-errors.ts:66-68` (recognize `23P01`)
- Test: `src/booking/lib/__tests__/booking-errors.test.ts` (new — this module has no existing test file)

**Interfaces:**
- Consumes: nothing (pure)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260902124500_bookings_exclusion_constraint.sql
-- Real DB-level double-booking guarantee. The existing
-- prevent_overlapping_staff_bookings trigger (SELECT-then-RAISE) is racy under
-- true concurrency — two simultaneous transactions can both pass its check
-- before either commits. An exclusion constraint is enforced via the same
-- index-insertion mechanism as a unique constraint, so it correctly serializes
-- concurrent inserts. The trigger stays in place (nice in-transaction error
-- message for the common non-race case); this constraint is the backstop.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap_excl
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (staff_id IS NOT NULL AND status IN ('pending', 'confirmed'));
```

**⚠️ Human review gate — do not apply until a human has reviewed and run it.** Note for the reviewer: this will fail to apply if any existing overlapping `pending`/`confirmed` bookings already exist in the data — run a check query first if there's any doubt about historical data cleanliness.

- [ ] **Step 2: Apply the migration (human)**

- [ ] **Step 3: Write the failing test for `booking-errors.ts`'s new case**

`booking-errors.ts` currently has no test file. Add one covering both the pre-existing behavior (regression safety) and the new `23P01` case:

```ts
// src/booking/lib/__tests__/booking-errors.test.ts
import { describe, expect, test } from "vitest";
import { classifyBookingError } from "@/booking/lib/booking-errors";

describe("classifyBookingError", () => {
  test("BOOKING_CONFLICT trigger message classifies as conflict", () => {
    const err = { message: "BOOKING_CONFLICT: staff has overlapping booking abc-123 from 2026-09-02T09:00:00Z to 2026-09-02T09:30:00Z" };
    expect(classifyBookingError(err).kind).toBe("conflict");
  });

  test("Postgres exclusion-violation (23P01) classifies as conflict", () => {
    const err = {
      code: "23P01",
      message: 'conflicting key value violates exclusion constraint "bookings_no_overlap_excl"',
    };
    expect(classifyBookingError(err).kind).toBe("conflict");
  });

  test("BOOKING_OUTSIDE_HOURS with a range classifies as outside_hours with the range", () => {
    const err = { message: "BOOKING_OUTSIDE_HOURS: 18:30 is outside staff working hours (09:00-17:00)" };
    const info = classifyBookingError(err);
    expect(info.kind).toBe("outside_hours");
    expect(info.hoursRange).toBe("09:00–17:00");
  });

  test("BOOKING_DURING_BREAK classifies as during_break with the range", () => {
    const err = { message: "BOOKING_DURING_BREAK: booking overlaps staff break (12:00-13:00)" };
    const info = classifyBookingError(err);
    expect(info.kind).toBe("during_break");
    expect(info.breakRange).toBe("12:00–13:00");
  });

  test("staff off / not scheduled classifies as closed_day", () => {
    const err = { message: "BOOKING_OUTSIDE_HOURS: staff is off on Tuesday (tue)" };
    expect(classifyBookingError(err).kind).toBe("closed_day");
  });

  test("unrecognized error classifies as unknown", () => {
    const err = { message: "some_other_db_error" };
    expect(classifyBookingError(err).kind).toBe("unknown");
  });

  test("non-object error input does not throw", () => {
    expect(classifyBookingError("plain string error").kind).toBe("unknown");
    expect(classifyBookingError(null).kind).toBe("unknown");
  });
});
```

- [ ] **Step 4: Run test to verify the new `23P01` case fails**

Run: `pnpm vitest run src/booking/lib/__tests__/booking-errors.test.ts`
Expected: 6 PASS, 1 FAIL (`23P01` case — currently falls through to `"unknown"`)

- [ ] **Step 5: Extend `classifyBookingError` to recognize the exclusion-constraint violation**

In `src/booking/lib/booking-errors.ts`, the matcher combines `message`/`details`/`hint` into `raw` (lines 26-34) — extend it to also fold in a Postgres `code` field, and add the `23P01`/`exclusion constraint` check alongside the existing `BOOKING_CONFLICT` check (around line 66):

```ts
const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } | null;
const parts = [
  e && typeof e.message === "string" ? e.message : "",
  e && typeof e.details === "string" ? e.details : "",
  e && typeof e.hint === "string" ? e.hint : "",
  e && typeof e.code === "string" ? e.code : "",
  err instanceof Error ? err.message : typeof err === "string" ? err : "",
].filter(Boolean);
const raw = parts.join(" | ");
```

```ts
if (/BOOKING_CONFLICT/i.test(raw) || raw.includes("23P01") || /exclusion constraint/i.test(raw)) {
  return { kind: "conflict", raw };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run src/booking/lib/__tests__/booking-errors.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260902124500_bookings_exclusion_constraint.sql src/booking/lib/booking-errors.ts src/booking/lib/__tests__/booking-errors.test.ts
git commit -m "feat(booking): DB-level double-booking exclusion constraint, map 23P01 to friendly conflict error"
```

---

### Task 10: Seed `booking-confirmation` and `booking-payment-failed` DB email templates

**Files:**
- Create: `supabase/migrations/20260902130000_booking_email_templates.sql`

- [ ] **Step 1: Write the migration**

Mirrors `20260819130000_subscription_email_templates.sql` exactly in shape. Vars match what Tasks 11-13 pass as `data`.

```sql
-- supabase/migrations/20260902130000_booking_email_templates.sql
-- Booking-confirmation and booking-payment-failed templates for the
-- sendEmail() pipeline (Resend). These two emails previously only existed as
-- React-Email components on the legacy enqueueBookingEmail() path; Week 3
-- moves both send call sites onto sendEmail(), matching how subscription
-- emails already work.

INSERT INTO public.email_templates (type, display_name, subject, body_html, body_text, allowed_vars)
VALUES
(
  'booking-confirmation',
  'Boeking bevestigd',
  'Je boeking bij {{shopName}} is bevestigd',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Je boeking is bevestigd</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{customerName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Je boeking voor <strong>{{serviceName}}</strong> bij <strong>{{shopName}}</strong> op {{whenLabel}} is bevestigd.</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Medewerker: {{staffName}}<br/>Prijs: {{priceLabel}}<br/>Adres: {{shopAddress}}</p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{customerName}}, je boeking voor {{serviceName}} bij {{shopName}} op {{whenLabel}} is bevestigd. Medewerker: {{staffName}}. Prijs: {{priceLabel}}. Adres: {{shopAddress}}.',
  ARRAY['customerName','shopName','serviceName','staffName','whenLabel','priceLabel','shopAddress']
),
(
  'booking-payment-failed',
  'Aanbetaling mislukt',
  'Je aanbetaling bij {{shopName}} is niet gelukt',
  '<html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#ffffff;color:#1a1330;padding:32px 28px;">'
    '<h1 style="font-size:22px;margin:0 0 16px;">Aanbetaling niet gelukt</h1>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hallo {{customerName}},</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">We konden je aanbetaling van {{amountLabel}} voor <strong>{{serviceName}}</strong> bij <strong>{{shopName}}</strong> op {{whenLabel}} niet verwerken. Je gereserveerde tijd is weer vrijgegeven.</p>'
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;"><a href="{{retryUrl}}">Probeer opnieuw te boeken</a></p>'
    '<p style="font-size:13px;color:#8a86a0;margin:0;">FlowyBookings</p>'
    '</body></html>',
  'Hallo {{customerName}}, we konden je aanbetaling van {{amountLabel}} voor {{serviceName}} bij {{shopName}} op {{whenLabel}} niet verwerken. Probeer opnieuw: {{retryUrl}}',
  ARRAY['customerName','shopName','serviceName','whenLabel','amountLabel','retryUrl']
)
ON CONFLICT (type) DO NOTHING;
```

**⚠️ Human review gate — do not apply until a human has reviewed and run it.**

- [ ] **Step 2: Apply the migration (human)**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260902130000_booking_email_templates.sql
git commit -m "feat(email): seed booking-confirmation and booking-payment-failed DB templates"
```

---

### Task 11: Move `booking-confirmation` onto `sendEmail()`, export a reusable function, fix the timezone bug

**Files:**
- Modify: `src/email/server/booking-confirmation.ts` (full rewrite of its body, same file)

**Interfaces:**
- Consumes: `sendEmail` from `@/email/send-email`, `formatInShopTz`/`resolveShopTimezone` from `@/shared/lib/shop-timezone`
- Produces: `sendBookingConfirmationEmail(bookingId: string): Promise<...>` — consumed by Task 12 (`connect-webhook.ts`)

- [ ] **Step 1: Rewrite the file**

Same overall shape (still no-JWT, still checks `confirmation_sent_at` + `shop_automations.confirmation_enabled`), but: uses `sendEmail()` instead of `enqueueBookingEmail()`, fetches `shops.timezone` to fix the "when" formatting bug, and extracts the core logic into an exported function so `connect-webhook.ts` can call it in-process without an HTTP round-trip (same shape as `processMolliePaymentNotification` being exported from `mollie-webhook.ts` for reuse).

```ts
// src/email/server/booking-confirmation.ts
// Sends the "booking confirmed" email. Two callers:
//   - PublicBookingFlow.tsx's public hooks/booking-confirmation route, for the
//     true no-deposit-needed instant-confirm path (anon caller, no JWT).
//   - connect-webhook.ts, in-process, right after it verifies a deposit
//     payment as paid via Mollie's API (the only place that actually knows
//     the payment succeeded).
// Idempotent via bookings.confirmation_sent_at AND sendEmail()'s own
// idempotencyKey — safe to call more than once for the same booking.

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/email/send-email'
import { formatInShopTz, resolveShopTimezone } from '@/shared/lib/shop-timezone'

export type BookingConfirmationResult =
  | { skipped: true; reason: string }
  | { error: string }
  | Awaited<ReturnType<typeof sendEmail>>

export async function sendBookingConfirmationEmail(bookingId: string): Promise<BookingConfirmationResult> {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return { error: 'Server not configured' }

  const supabase = createClient(url, serviceKey)

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, shop_id, starts_at, confirmation_sent_at, customer_id, service_id, staff_id, price_cents, currency')
    .eq('id', bookingId)
    .maybeSingle()
  if (bErr || !booking) return { error: 'Booking not found' }
  if (booking.confirmation_sent_at) return { skipped: true, reason: 'already_sent' }

  const { data: auto } = await supabase
    .from('shop_automations').select('confirmation_enabled').eq('shop_id', booking.shop_id).maybeSingle()
  if (auto && auto.confirmation_enabled === false) return { skipped: true, reason: 'disabled' }

  const [{ data: customer }, { data: shop }, { data: service }, { data: staff }] = await Promise.all([
    booking.customer_id
      ? supabase.from('customers').select('full_name, email').eq('id', booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('shops').select('name, address, timezone').eq('id', booking.shop_id).maybeSingle(),
    booking.service_id
      ? supabase.from('services').select('name').eq('id', booking.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
    booking.staff_id
      ? supabase.from('staff').select('full_name').eq('id', booking.staff_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!customer?.email) return { skipped: true, reason: 'no_email' }

  const startsAt = new Date(booking.starts_at)
  const shopTz = resolveShopTimezone((shop as { timezone?: string | null } | null)?.timezone)
  const whenLabel = formatInShopTz(startsAt, shopTz, 'EEE d MMM, HH:mm')
  const priceLabel = `${(booking.currency || 'EUR') === 'EUR' ? '€' : (booking.currency + ' ')}${(booking.price_cents / 100).toFixed(2)}`

  const result = await sendEmail({
    type: 'booking-confirmation',
    to: customer.email,
    idempotencyKey: `booking-confirm-${booking.id}`,
    data: {
      customerName: customer.full_name?.split(' ')[0] ?? '',
      shopName: shop?.name ?? '',
      serviceName: service?.name ?? '',
      staffName: staff?.full_name ?? '',
      whenLabel,
      priceLabel,
      shopAddress: shop?.address ?? '',
    },
  })

  if (result.success) {
    await supabase.from('bookings').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', booking.id)
  }
  return result
}

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    let bookingId: string
    try {
      const body = await request.json()
      bookingId = body?.bookingId
      if (!bookingId || typeof bookingId !== 'string') {
        return Response.json({ error: 'bookingId required' }, { status: 400 })
      }
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const result = await sendBookingConfirmationEmail(bookingId)
    if ('error' in result) {
      return Response.json(result, { status: result.error === 'Booking not found' ? 404 : 500 })
    }
    return Response.json(result)
  },
}
```

- [ ] **Step 2: Manual verification**

Trigger the existing no-deposit instant-confirm booking path in the dev server and confirm the email still sends (via `email_send_log` row + `booking-confirmation` type) and `whenLabel` now shows shop-local time.

- [ ] **Step 3: Commit**

```bash
git add src/email/server/booking-confirmation.ts
git commit -m "fix(email): move booking-confirmation onto sendEmail(), fix server-tz formatting bug, export for reuse"
```

---

### Task 12: Send the confirmation email from the webhook on real paid-deposit success; move payment-failed email onto `sendEmail()` too

**Files:**
- Modify: `src/shop/payments/server/connect-webhook.ts`

**Interfaces:**
- Consumes: `sendBookingConfirmationEmail` (Task 11), `sendEmail` (for the rewritten `sendPaymentFailedEmail`)

- [ ] **Step 1: Call the confirmation email on the real paid-deposit path**

This is the actual bug fix — today, deposit-paid bookings never receive a confirmation email at all (the client-side trigger returns before this point; the webhook confirms the booking but never emails). Replace the `newStatus === "paid"` branch (lines 112-117 of the previous read):

```ts
import { sendBookingConfirmationEmail } from "@/email/server/booking-confirmation";

// ...

if (payment.booking_id) {
  if (newStatus === "paid") {
    const { data: confirmedBooking } = await supabaseAdmin
      .from("bookings")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", payment.booking_id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    await supabaseAdmin.from("activity_log").insert({
      entity: "payment",
      action: "confirmed",
      shop_id: payment.shop_id,
      metadata: { payment_id: payment.id, booking_id: payment.booking_id },
    });

    // Only email on the actual pending->confirmed transition — a retried
    // webhook delivery for an already-confirmed booking must not re-send.
    if (confirmedBooking) {
      await sendBookingConfirmationEmail(payment.booking_id).catch((err) =>
        log.error("confirmation_email_error", { booking_id: payment.booking_id, err }),
      );
    }
  } else if (newStatus === "failed") {
    // ...unchanged...
  }
}
```

- [ ] **Step 2: Move `sendPaymentFailedEmail` onto `sendEmail()`, fix its timezone bug**

Replace the function body (previously lines 160-208):

```ts
import { sendEmail } from "@/email/send-email";
import { formatInShopTz, resolveShopTimezone } from "@/shared/lib/shop-timezone";

// Send "aanbetaling mislukt" email to the customer with a retry link.
// Best-effort: any failure here is logged but never blocks the webhook ack.
async function sendPaymentFailedEmail(bookingId: string, paymentId: string) {
  try {
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, shop_id, starts_at, customer_id, service_id, deposit_cents, currency")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return;

    const [{ data: customer }, { data: shop }, { data: service }] = await Promise.all([
      booking.customer_id
        ? supabaseAdmin.from("customers").select("full_name, email").eq("id", booking.customer_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabaseAdmin.from("shops").select("name, slug, timezone").eq("id", booking.shop_id).maybeSingle(),
      booking.service_id
        ? supabaseAdmin.from("services").select("name").eq("id", booking.service_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    if (!customer?.email) return;

    const startsAt = new Date(booking.starts_at);
    const shopTz = resolveShopTimezone(shop?.timezone);
    const whenLabel = formatInShopTz(startsAt, shopTz, "EEE d MMM, HH:mm");
    const cents = booking.deposit_cents ?? 0;
    const currency = booking.currency || "EUR";
    const amountLabel = cents > 0
      ? `${currency === "EUR" ? "€" : currency + " "}${(cents / 100).toFixed(2).replace(".", ",")}`
      : "";
    const retryUrl = getBookingUrl(shop?.slug ?? null, { external: true });

    await sendEmail({
      type: "booking-payment-failed",
      to: customer.email,
      idempotencyKey: `booking-payment-failed-${paymentId}`,
      data: {
        customerName: customer.full_name?.split(" ")[0] ?? "",
        shopName: shop?.name ?? "",
        serviceName: service?.name ?? "",
        whenLabel,
        amountLabel,
        retryUrl,
      },
    });
  } catch (err) {
    log.error("payment_failed_email_error", { booking_id: bookingId, payment_id: paymentId, err });
  }
}
```

Remove the now-unused `enqueueBookingEmail` import.

- [ ] **Step 3: Manual verification**

Run a full deposit-payment test against a real (or sandboxed) Mollie Connect account: confirm the booking flips to `confirmed`, an `email_send_log` row with `template_name = 'booking-confirmation'` appears, and `activity_log` gets a `payment`/`confirmed` row. Separately, force a failed payment and confirm `email_send_log` gets `booking-payment-failed` with correct shop-local `whenLabel`.

- [ ] **Step 4: Commit**

```bash
git add src/shop/payments/server/connect-webhook.ts
git commit -m "fix(payments): send confirmation email on real paid-deposit success (was never sent); move payment-failed email to sendEmail(), fix tz bug"
```

---

### Task 13: Pending-booking TTL sweep

**Files:**
- Create: `src/booking/server/booking-expiry-decision.ts`, `src/booking/server/__tests__/booking-expiry-decision.test.ts`, `src/booking/server/booking-expiry.ts`, `src/routes/hooks/booking-expiry.ts`, `supabase/migrations/20260902140000_booking_expiry_cron.sql`

**Interfaces:**
- Produces: `isPendingBookingExpired(booking: { status: string; created_at: string }, now: number, ttlMinutes: number): boolean`

- [ ] **Step 1: Write the failing test**

Mirrors `expiry-sweep-decision.test.ts`'s shape exactly.

```ts
// src/booking/server/__tests__/booking-expiry-decision.test.ts
import { describe, expect, test } from "vitest";
import { isPendingBookingExpired } from "@/booking/server/booking-expiry-decision";

describe("isPendingBookingExpired", () => {
  const now = new Date("2026-09-02T12:00:00.000Z").getTime();
  const ttlMinutes = 30;

  test("not expired: pending booking created just now", () => {
    const booking = { status: "pending", created_at: new Date(now).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(false);
  });

  test("not expired: pending booking created 29 minutes ago", () => {
    const booking = { status: "pending", created_at: new Date(now - 29 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(false);
  });

  test("expired: pending booking created exactly 30 minutes ago", () => {
    const booking = { status: "pending", created_at: new Date(now - 30 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(true);
  });

  test("expired: pending booking created 1 hour ago", () => {
    const booking = { status: "pending", created_at: new Date(now - 60 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(true);
  });

  test("never expires a confirmed booking", () => {
    const booking = { status: "confirmed", created_at: new Date(now - 60 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(false);
  });

  test("never expires an already-cancelled booking", () => {
    const booking = { status: "cancelled", created_at: new Date(now - 60 * 60_000).toISOString() };
    expect(isPendingBookingExpired(booking, now, ttlMinutes)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/booking/server/__tests__/booking-expiry-decision.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/booking/server/booking-expiry-decision.ts
// Pure per-booking decision logic for the pending-booking-expiry cron sweep,
// mirroring expiry-sweep-decision.ts's shape (billing) so the same testing
// pattern applies without a fake Supabase client.

export function isPendingBookingExpired(
  booking: { status: string; created_at: string },
  now: number,
  ttlMinutes: number,
): boolean {
  if (booking.status !== "pending") return false;
  const createdAt = new Date(booking.created_at).getTime();
  return now - createdAt >= ttlMinutes * 60_000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/booking/server/__tests__/booking-expiry-decision.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the cron handler**

Mirrors `billing-expiry.ts`'s shape (auth via `cronAuthorized`, plain JSON response, `createLogger`).

```ts
// src/booking/server/booking-expiry.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cronAuthorized } from "@/server/cron-auth";
import { createLogger } from "@/server/logger";
import { isPendingBookingExpired } from "@/booking/server/booking-expiry-decision";
import { sendEmail } from "@/email/send-email";
import { getBookingUrl } from "@/shared/lib/booking-url";
import { formatInShopTz, resolveShopTimezone } from "@/shared/lib/shop-timezone";

const log = createLogger("booking.expiry");
const PENDING_TTL_MINUTES = 30;

export const handlers = {
  POST: async ({ request }: { request: Request }) => {
    if (!cronAuthorized(request)) return json({ error: "unauthorized" }, 401);

    const now = Date.now();
    const cutoffIso = new Date(now - PENDING_TTL_MINUTES * 60_000).toISOString();

    const { data: candidates, error } = await supabaseAdmin
      .from("bookings")
      .select("id, shop_id, status, created_at, customer_id, service_id, starts_at, deposit_cents, currency")
      .eq("status", "pending")
      .lt("created_at", cutoffIso);

    if (error) return json({ error: "fetch_failed", detail: error.message }, 500);

    const expired: string[] = [];

    for (const booking of candidates ?? []) {
      if (!isPendingBookingExpired(booking, now, PENDING_TTL_MINUTES)) continue;

      const { data: cancelled } = await supabaseAdmin
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!cancelled) continue;

      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("booking_id", booking.id)
        .eq("status", "unpaid");

      await supabaseAdmin.from("activity_log").insert({
        entity: "booking",
        action: "expired_pending_sweep",
        shop_id: booking.shop_id,
        metadata: { booking_id: booking.id, ttl_minutes: PENDING_TTL_MINUTES },
      });

      await sendExpiryEmail(booking).catch((err) => log.error("expiry_email_error", { booking_id: booking.id, err }));

      expired.push(booking.id);
    }

    log.info("swept", { count: expired.length });
    return json({ ok: true, ran_at: new Date(now).toISOString(), expired });
  },
};

async function sendExpiryEmail(booking: {
  id: string; shop_id: string; customer_id: string | null; service_id: string | null;
  starts_at: string; deposit_cents: number | null; currency: string | null;
}) {
  if (!booking.customer_id) return;
  const [{ data: customer }, { data: shop }, { data: service }] = await Promise.all([
    supabaseAdmin.from("customers").select("full_name, email").eq("id", booking.customer_id).maybeSingle(),
    supabaseAdmin.from("shops").select("name, slug, timezone").eq("id", booking.shop_id).maybeSingle(),
    booking.service_id
      ? supabaseAdmin.from("services").select("name").eq("id", booking.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!customer?.email) return;

  const shopTz = resolveShopTimezone(shop?.timezone);
  const whenLabel = formatInShopTz(new Date(booking.starts_at), shopTz, "EEE d MMM, HH:mm");
  const cents = booking.deposit_cents ?? 0;
  const currency = booking.currency || "EUR";
  const amountLabel = cents > 0 ? `${currency === "EUR" ? "€" : currency + " "}${(cents / 100).toFixed(2).replace(".", ",")}` : "";

  await sendEmail({
    type: "booking-payment-failed",
    to: customer.email,
    idempotencyKey: `booking-expired-${booking.id}`,
    data: {
      customerName: customer.full_name?.split(" ")[0] ?? "",
      shopName: shop?.name ?? "",
      serviceName: service?.name ?? "",
      whenLabel,
      amountLabel,
      retryUrl: getBookingUrl(shop?.slug ?? null, { external: true }),
    },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
```

- [ ] **Step 6: Register the route**

```ts
// src/routes/hooks/booking-expiry.ts
import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/booking-expiry";

export const Route = createFileRoute("/hooks/booking-expiry")({
  server: { handlers },
});
```

- [ ] **Step 7: Schedule the cron, following the current vault-`app_url` pattern**

```sql
-- supabase/migrations/20260902140000_booking_expiry_cron.sql
-- Schedules the pending-booking TTL sweep. Same vault app_url + cron_secret
-- pattern as 20260820130000_billing_crons_app_url.sql — do not hardcode the
-- host here.

DO $$
DECLARE
  v_key text;
  v_auth text;
  v_base text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_key := NULL;
  END;

  IF v_key IS NULL OR v_key = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_key := NULL;
    END;
  END IF;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE NOTICE 'No cron_secret / email_queue_service_role_key in vault — skip booking-expiry cron schedule';
    RETURN;
  END IF;

  SELECT rtrim(decrypted_secret, '/') INTO v_base FROM vault.decrypted_secrets WHERE name = 'app_url' LIMIT 1;
  IF v_base IS NULL OR v_base = '' THEN
    RAISE EXCEPTION 'vault secret app_url is empty';
  END IF;

  v_auth := 'Bearer ' || v_key;

  BEGIN PERFORM cron.unschedule('booking-expiry-sweep'); EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Every 10 minutes: TTL is 30 minutes, so this bounds the worst-case lag
  -- between a booking going stale and its slot being released.
  PERFORM cron.schedule(
    'booking-expiry-sweep',
    '*/10 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L),
        body := '{}'::jsonb
      );
      $cron$,
      v_base || '/hooks/booking-expiry',
      v_auth
    )
  );
END $$;
```

**⚠️ Human review gate — do not apply until a human has reviewed and run it.**

- [ ] **Step 8: Apply the migration (human)**

- [ ] **Step 9: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/booking/server/booking-expiry-decision.ts src/booking/server/__tests__/booking-expiry-decision.test.ts src/booking/server/booking-expiry.ts src/routes/hooks/booking-expiry.ts supabase/migrations/20260902140000_booking_expiry_cron.sql
git commit -m "feat(booking): TTL sweep for abandoned pending bookings, releases slot + notifies customer"
```

---

### Task 14: Confirmation page live status + polling + retry; fix the 90-day max-date timezone bug

**Files:**
- Modify: `src/booking/pages/ConfirmationPage.tsx`, `src/booking/components/PublicBookingFlow.tsx` (max-date check)

- [ ] **Step 1: Fix the 90-day max-bookable-date browser-local bug**

In `PublicBookingFlow.tsx`, the max-date check currently builds the cutoff from `new Date()` + `.setDate()` (browser-local) and compares against `civilDateYmd(max)` (also browser-local). Replace with the shop-local equivalent using the already-imported `shop-timezone.ts` helpers:

```ts
import { shopTodayYmd } from "@/shared/lib/shop-timezone";

// wherever the max-bookable-date cutoff is computed:
const shopTz = selectedShop?.timezone;
const todayYmd = shopTodayYmd(shopTz);
const [ty, tm, td] = todayYmd.split("-").map(Number);
const maxDate = new Date(Date.UTC(ty, tm - 1, td + MAX_BOOKABLE_DAYS));
const maxYmd = `${maxDate.getUTCFullYear()}-${String(maxDate.getUTCMonth() + 1).padStart(2, "0")}-${String(maxDate.getUTCDate()).padStart(2, "0")}`;
// compare candidate dateYmd against maxYmd as plain strings (both already yyyy-MM-dd)
```

(`MAX_BOOKABLE_DAYS` is whatever constant the existing code already uses for the 90-day window — reuse it, don't hardcode `90` again.)

- [ ] **Step 2: Render booking/payment status on the confirmation page instead of unconditional success**

`get_public_booking_confirmation` already returns `booking.status` — `ConfirmationPage.tsx` just never reads it. Add three render branches and short polling while `pending`:

```ts
const { data, isLoading, error } = useQuery({
  queryKey: ["booking-confirmation", bookingId],
  queryFn: async () => { /* ...unchanged... */ },
  refetchInterval: (query) => {
    const status = query.state.data?.booking?.status;
    return status === "pending" ? 2000 : false;
  },
});
```

Add a bounded stop so polling doesn't run forever if a webhook never arrives (fall back to the static "we'll email you" message after ~20s):

```ts
const [pollingStartedAt] = useState(() => Date.now());
const pollingTimedOut = Date.now() - pollingStartedAt > 20_000;
```

Render branches, replacing the current single unconditional success block:

```tsx
if (data.booking.status === "cancelled") {
  return (
    <StatusShell
      title={t("book.paymentFailedTitle")}
      subtitle={t("book.paymentFailedSub")}
      action={shop?.slug ? <Link to="/book/$slug" params={{ slug: shop.slug }}>{t("book.tryAgain")}</Link> : null}
    />
  );
}

if (data.booking.status === "pending" && !pollingTimedOut) {
  return <StatusShell title={t("book.confirmingPayment")} spinner />;
}

if (data.booking.status === "pending" && pollingTimedOut) {
  return <StatusShell title={t("book.confirmingPaymentSlow")} subtitle={t("book.confirmingPaymentSlowSub")} />;
}

// existing "confirmed" render block (booking.status === "confirmed" / "completed") stays as-is below
```

`StatusShell` is a small local component factoring out the centered-card layout already used by the existing not-found and success states in this file (same container markup, parameterized title/subtitle/action/spinner) — extracted here since it's now used by four states instead of two.

- [ ] **Step 3: Manual verification**

Walk a real deposit booking through Mollie's test mode: confirm the confirmation page shows a "confirming your payment" spinner immediately after redirect back, then flips to the success view within a couple of polls once the webhook lands. Force a failed payment and confirm the page shows the failure view with a working "try again" link back to `/book/$slug`.

- [ ] **Step 4: Commit**

```bash
git add src/booking/pages/ConfirmationPage.tsx src/booking/components/PublicBookingFlow.tsx
git commit -m "feat(booking): confirmation page reflects real payment status with polling + retry; fix max-date tz bug"
```

---

### Task 15: Remaining-balance display on the shop owner's booking view

**Files:**
- Modify: `src/shop/calendar/ShopCalendarPage.tsx` (booking view/edit dialog — the same dialog whose save payload is at line 1249)

- [ ] **Step 1: Add the computed balance line**

The dialog already loads `price_cents` and `deposit_cents` for the booking being viewed/edited (confirmed via the existing save payload at line 1249). Add a read-only line showing the remaining balance wherever the price is currently displayed in that dialog:

```ts
const remainingBalanceCents = Math.max(0, (booking?.price_cents ?? svc?.price_cents ?? 0) - (booking?.deposit_cents ?? svc?.deposit_cents ?? 0));
```

```tsx
{remainingBalanceCents > 0 && (
  <p className="text-xs text-muted-foreground">
    {t("calendar.remainingBalance", { amount: formatCents(remainingBalanceCents, booking?.currency ?? "EUR") })}
  </p>
)}
```

(`formatCents` is already imported/used elsewhere in this file for price display — reuse it, don't reimplement.)

- [ ] **Step 2: Manual verification**

Open a booking with a partial deposit in the calendar view and confirm the remaining-balance line shows the correct price-minus-deposit figure; confirm it's hidden for fully-paid or zero-deposit bookings.

- [ ] **Step 3: Commit**

```bash
git add src/shop/calendar/ShopCalendarPage.tsx
git commit -m "feat(calendar): show remaining balance owed on booking detail view"
```

---

## Self-Review

**Spec coverage** — every Global Constraint traces to a task: webhook auth → Task 3; shared status mapping → Task 2; deposit model + UI → Tasks 4-6; per-service no-Mollie blocking → Task 7; payment idempotency → Task 8; double-booking constraint → Task 9; email templates + pipeline migration → Tasks 10-12; confirmation-email-never-sent bug → Task 12; TTL sweep → Task 13; confirmation-page status/polling/retry → Task 14; the three named timezone bugs → Tasks 11, 12, 14; balance display → Task 15; activity_log + createLogger conventions → threaded through Tasks 7, 8, 9, 12, 13.

**Placeholder scan** — no task contains "TBD"/"handle appropriately"/unshown code; every step has real, file-grounded code or an exact human-review instruction where DB application requires it.

**Type consistency** — `DepositService` (Task 5) is used identically by `checkout.ts` and `PublicBookingFlow.tsx` (Task 7); `mapMollieStatus`'s return type (`"paid" | "failed" | "unpaid" | null`) is consumed identically by both webhook files; `isPendingBookingExpired`'s signature matches its only caller in Task 13's cron handler.

**Explicitly out of scope** (per Global Constraints / prior agreement, not omissions): E2E/whole-flow testing, admin/staff-side calendar timezone bugs, in-shop manual booking creation, refund/chargeback webhook automation (manual refund already exists via `refund.ts`, untouched), dropping the now-fully-dead `shops.default_deposit_percent` column.
