# Week 1 Engineering Plan — Foundation & Security

**Project:** FlowyBookings Platform Completion  
**Sprint:** Week 1 (Days 1-5)  
**Prepared:** 6 August 2026

---

## Executive Summary

Week 1 addresses four critical security vulnerabilities and establishes the email delivery foundation. The work splits into **5 parallel tracks** with clear dependencies. Three items are launch-blocking security defects; two are infrastructure setup that unblocks future work.

**Critical path:** RLS fixes (Day 1) → Booking link fix (Day 1-2) → Owner workflow validation (Day 2-3)  
**Parallel:** Email infrastructure (Day 1-2) can run independently

---

## Work Item Analysis

### 1. Fix Tenant Data Isolation (RLS Policy Leaks)

#### What Currently Exists
- RLS enabled on all tables
- Three overly-permissive anonymous policies:
  - `customers_public_select_by_shop` (migration `20260417201426...sql:10-15`)
  - `bookings_public_read_active` (migration `20260418160002...sql:3-6`)
  - `payments_public_read_active` (migration `20260418160002...sql:8-11`)
- Each policy checks only `shop.status = 'active'`, not ownership
- Result: any anonymous visitor can `SELECT * FROM customers/bookings/payments` for all active shops

#### What Is Missing
- Scoped read policies that restrict anon to specific rows
- A `SECURITY DEFINER` RPC for customer email de-duplication (the legitimate use case)
- Per-booking capability-based access (e.g., via booking UUID or signed token)

#### Risks
- **Severity: CRITICAL** — Direct PII leak (customer names, emails, phones, booking details, payment amounts)
- **Exploitability: TRIVIAL** — Requires only the publishable anon key (shipped to browsers)
- **Compliance:** GDPR/privacy violation; business can be held liable
- **Reputational:** Disclosure would destroy trust before launch

#### Dependencies
- None (can be fixed immediately)
- Blocks: public booking demo to client (cannot demo with active data leak)

#### Implementation Complexity
- **Effort:** 4-6 hours
- **Risk:** Low (surgical DB change, well-understood pattern)
- **Testing surface:** Medium (must verify anon cannot read cross-shop, but owners/staff can)

#### Testing Requirements
- Unit: RLS policy tests in pgTAP or equivalent
- Integration: Verify anon cannot `SELECT` another shop's rows via PostgREST
- Regression: Confirm authenticated owner/staff access still works
- Test matrix: anon / authenticated / shop_owner / super_admin × each table

---

### 2. Repair Public Booking Link

#### What Currently Exists
- Route: `/book` expects `?shop=<uuid>` query param (`src/routes/book.tsx:37-51`)
- Link generator: `getBookingUrl()` builds `/book/<slug>` path segment (`src/lib/booking-url.ts:27-31`)
- Used in: `BookingLinkCard`, `OnboardingChecklist`, QR codes, share buttons, retry emails
- Result: every shared link returns 404

#### What Is Missing
- Matching route for `/book/<slug>` OR
- Updated `getBookingUrl` to build `?shop=<uuid>` OR
- Slug-to-UUID resolution inside the existing `/book` loader

#### Risks
- **Severity: HIGH** — Zero customers can book (dead links)
- **Decision risk:** Choosing slug-based vs UUID-based routing affects SEO, link readability, and shop privacy. Slugs are prettier and shareable; UUIDs are harder to enumerate.
- **Data risk:** Slug must be unique and stable; renaming a shop must not break existing shared links (need slug history or immutable slug)

#### Dependencies
- Depends on: decision — slug-based or query-param routing (client/PO input helpful)
- Blocks: all public booking work (Week 3), onboarding "share your link" step, QR posters

#### Implementation Complexity
- **Effort:** 3-5 hours (route + resolver + update all call sites)
- **Risk:** Low-Medium (touches multiple call sites; must not miss one)
- **Testing surface:** Medium

#### Testing Requirements
- Valid slug resolves to correct shop
- Invalid/unknown slug shows a clear error page (not a raw 404 or blank screen)
- Inactive/suspended shop shows appropriate message
- All call sites (card, checklist, QR, email) produce a working link
- Legacy `?shop=<uuid>` links still work if kept for backward compatibility

---

### 3. Add Email Verification at Signup

#### What Currently Exists
- Signup calls `supabase.auth.signUp` with `emailRedirectTo: .../shop` (`src/routes/signup.tsx:78`)
- Immediately after signup, code assumes a session: creates shop, assigns role, navigates to `/shop` (`signup.tsx:88-155`)
- If Supabase "Confirm email" is ON, `data.user` exists but there is **no session** → shop creation runs unauthenticated and fails RLS, or the flow breaks silently
- If "Confirm email" is OFF, unverified emails get full access

#### What Is Missing
- A clear "check your email" state after signup
- Handling for the confirmed-email redirect landing (create shop *after* verification, not before)
- Resend-verification affordance
- Decision + config on whether email confirmation is enforced

#### Risks
- **Severity: MEDIUM-HIGH** — Broken signup if confirmation is enabled; spam/fake accounts if disabled
- **Logic risk:** Shop creation currently happens pre-verification — wrong place in the lifecycle
- **UX risk:** User stuck on a blank/errored screen after signup

#### Dependencies
- Depends on: Email infrastructure (Ticket track 5) being live to actually send verification mail
- Depends on: RLS fixes (shop creation must run as an authenticated, verified user)
- Blocks: reliable owner onboarding

#### Implementation Complexity
- **Effort:** 5-7 hours (reorder lifecycle + verification UX + resend)
- **Risk:** Medium (auth lifecycle changes are error-prone)
- **Testing surface:** High (multiple auth states)

#### Testing Requirements
- Signup with confirmation ON → sees "check email" → clicks link → shop created → lands on dashboard
- Resend verification works and is rate-limited
- Duplicate email handled gracefully (already exists)
- No shop/role rows created before verification completes
- Expired/invalid verification token shows clear message

---

### 4. Configure Email Delivery End-to-End

#### What Currently Exists
- PGMQ queues: `auth_emails`, `transactional_emails` (+ DLQs) — `20260418142326_email_infra.sql`
- RPC wrappers: `enqueue_email`, `read_email_batch`, `delete_email`, DLQ mover
- Queue processor route calling `sendLovableEmail` from `@lovable.dev/email-js` (`src/routes/lovable/email/queue/process.ts`)
- Requires `LOVABLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`
- pg_cron drain job (`process-email-queue`, 5s interval) is **documented but must be verified as actually scheduled** — the migration comments describe it; confirm the job row exists
- Enqueue helper writes `email_send_log` rows with `pending`/`failed` status

#### What Is Missing
- Verified environment configuration (API key present in the deployed environment)
- Confirmation that the pg_cron job is actually running and draining
- Vault secret `email_queue_service_role_key` present
- An observable proof-of-delivery (a real email arriving in an inbox)
- DLQ monitoring / alerting for failed sends

#### Risks
- **Severity: MEDIUM (infra)** — If the key/cron/vault secret is missing, emails silently queue forever
- **Blocking risk:** Every downstream email feature (Weeks 2-4) depends on this pipe
- **Silent-failure risk:** Failures land in `email_send_log`/DLQ, not visible to users

#### Dependencies
- Depends on: access to deployment environment secrets, Lovable email account/key
- Blocks: email verification (Ticket 3), all future email features

#### Implementation Complexity
- **Effort:** 4-6 hours (config + verify + one real send + DLQ check)
- **Risk:** Medium (external service, environment access)
- **Testing surface:** Medium

#### Testing Requirements
- Enqueue a test email → observe it drain from queue → arrives in inbox
- Verify `email_send_log` transitions pending → sent
- Force a failure → verify DLQ receives it and logs the reason
- Confirm cron job row exists and fires on schedule

---

### 5. Validate & Fix Existing Owner Workflows

#### What Currently Exists
- Shop creation (`signup.tsx`), onboarding wizard (`ShopOnboarding.tsx`), onboarding checklist (`OnboardingChecklist.tsx`)
- Services, staff + working hours, customer management (including import) — all present per audit
- These are reported as "works under ideal conditions" — needs adversarial testing

#### What Is Missing
- Confirmed pass/fail status for each flow under real + edge conditions
- Fixes for whatever the validation surfaces (unknown until tested)

#### Risks
- **Severity: MEDIUM** — Unknown defects hide here; scope can expand
- **Estimation risk:** "Test and fix" has an open-ended fix tail — timebox it

#### Dependencies
- Depends on: RLS fixes (test under correct security model), email (verification path)
- Soft dependency on booking link fix (onboarding surfaces the link)

#### Implementation Complexity
- **Effort:** 6-10 hours (test pass + timeboxed fixes)
- **Risk:** Medium (open-ended)
- **Testing surface:** High (full owner journey)

#### Testing Requirements
- End-to-end: register → verify → create shop → onboard → add service → add staff + hours → add/import customers
- Edge cases: empty states, invalid input, duplicate names, import with malformed rows
- Cross-browser smoke on desktop

---

## Recommended Implementation Order (Revised for Delayed Infrastructure Access)

```
Day 1  ├─ Ticket 2.1  Booking link decision + fix       (frontend only)
       ├─ Ticket 2.2  Invalid-link error page            (frontend only)
       └─ Ticket 1.3  RLS migration files (prep)         (write SQL, no deploy)

Day 2  ├─ Ticket 3.1  Signup lifecycle reorder          (frontend logic)
       ├─ Ticket 3.2  Verification UX + resend           (frontend UI)
       └─ Ticket 4.1  Owner workflow test pass (audit)   (manual, local)

Day 3  ├─ Ticket 4.2  Fix surfaced defects (timeboxed)  (likely frontend)
       └─ Ticket 1.3  Complete RLS + email migrations    (finalize SQL)

Day 4  ├─ INFRASTRUCTURE ACCESS ARRIVES
       ├─ Ticket 1.1  Deploy RLS: customers policy
       ├─ Ticket 1.2  Deploy RLS: bookings + payments
       └─ Ticket 5.1  Email: verify config + cron

Day 5  ├─ Ticket 5.2  Email: prove one real send + DLQ
       ├─ Ticket 6.1  Integrated E2E + two-shop isolation test
       └─ Client demo prep
```

**Rationale:** This ordering keeps engineers productive while waiting for infrastructure access.

**Days 1-3: Maximum frontend progress without deployment**
- Booking link fix (Day 1) unblocks all downstream work that references the link and can be developed/tested locally
- Invalid-link error page completes the routing work
- Signup lifecycle reorder is pure frontend logic — can be built and unit-tested without touching the database
- Verification UX is pure UI — can be mocked locally
- Workflow audit runs manually against local dev environment
- RLS migrations written as SQL files, reviewed, tested in local Supabase, ready to deploy

**Day 4: Infrastructure deployment sprint**
- As soon as access arrives, deploy all prepared migrations at once
- Verify email infrastructure (pg_cron, vault secret, API key)
- This is intentionally a dense deployment day, but all SQL is pre-written and reviewed

**Day 5: Integration & validation**
- Prove email actually sends end-to-end (depends on Day 4 infra)
- Full E2E test with deployed security fixes
- Demo prep with confidence everything works in production

**Why this works:**
- Zero idle time Days 1-3 — all frontend/UI/logic work parallelized
- RLS SQL written early, gets peer review before deployment
- Single infrastructure "switchover" moment (Day 4) rather than distributed
- Day 5 has buffer for integration issues
- Client demo Friday afternoon uses fully deployed, tested system

---

## Parallelization Map (Revised)

**Days 1-3: Pre-infrastructure work (no deployment dependency)**

| Can run in parallel | Reason |
|---|---|
| Booking link (2.x) + RLS SQL writing (1.3) | One is frontend, one is SQL prep |
| Signup lifecycle (3.1) + Verification UX (3.2) | Different components, same feature |
| All Day 1-2 work is parallelizable | No deployment dependencies until Day 4 |

**Day 4+: Infrastructure-dependent work**

| Must be sequential | Reason |
|---|---|
| Infrastructure access → RLS deploy (1.1, 1.2) | Cannot deploy without access |
| RLS deploy (1.x) → E2E (6.1) | E2E must test under correct security |
| Email config (5.1) → Email send test (5.2) | Cannot test until infrastructure verified |

**Key insight:** The constraint actually *increases* parallelization Days 1-3 since all frontend work can happen concurrently while waiting for access.

---

## Development Tickets

### Ticket 1.1 — Scope customer RLS to owner (CRITICAL)
**Est:** 2-3h  
**Acceptance Criteria:**
- Anonymous role cannot `SELECT` customers of any shop via PostgREST
- Legitimate email de-dup during booking works via a `SECURITY DEFINER` RPC (no broad read)
- Shop owner and staff can still read their own shop's customers
- pgTAP/integration test proves cross-shop denial
- **Blocks:** Ticket 6.1, client demo

### Ticket 1.2 — Scope bookings & payments RLS (CRITICAL)
**Est:** 3-4h  
**Acceptance Criteria:**
- Anon cannot `SELECT` arbitrary bookings/payments
- Public booking still works via capability (booking UUID / token) not broad read
- Owner/staff read their own shop's rows only
- Test matrix (anon/owner/staff/admin) passes
- **Blocks:** Ticket 6.1, client demo

### Ticket 2.1 — Fix booking link generation
**Est:** 3-4h  
**Acceptance Criteria:**
- A shared link opens the correct shop's public booking page (no 404)
- All call sites updated: `BookingLinkCard`, `OnboardingChecklist`, `booking-poster`, `ShopOnboarding`
- Backward compatibility decision documented and implemented
- **Depends on:** routing decision (see Client Confirmations)
- **Blocks:** Ticket 6.1

### Ticket 2.2 — Invalid booking link error page
**Est:** 2-3h  
**Acceptance Criteria:**
- Unknown slug/UUID shows a branded, clear error page
- Inactive/suspended shop shows an appropriate message
- No blank screens or raw stack traces

### Ticket 3.1 — Reorder signup lifecycle for verification
**Est:** 3-4h  
**Acceptance Criteria:**
- Shop + role are created only after email is verified (not pre-verification)
- No orphaned/partial rows if a user never verifies
- Works whether "Confirm email" is ON (target state)
- **Depends on:** Ticket 5.1

### Ticket 3.2 — Verification UX + resend
**Est:** 2-3h  
**Acceptance Criteria:**
- After signup, user sees a clear "check your email" screen
- Resend button works and is rate-limited
- Expired/invalid token shows a clear message with next steps
- **Depends on:** Ticket 5.1

### Ticket 5.1 — Verify email infrastructure config
**Est:** 2-3h  
**Acceptance Criteria:**
- `LOVABLE_API_KEY`, service role key, vault secret confirmed present in target env
- pg_cron `process-email-queue` job row exists and is enabled
- Documented runbook for env setup
- **Blocks:** Tickets 3.1, 3.2

### Ticket 5.2 — Prove real email delivery + DLQ
**Est:** 2-3h  
**Acceptance Criteria:**
- A test email enqueued drains and arrives in a real inbox
- `email_send_log` transitions pending → sent
- A forced failure lands in DLQ with a logged reason
- **Depends on:** Ticket 5.1

### Ticket 4.1 — Owner workflow audit pass
**Est:** 3-4h  
**Acceptance Criteria:**
- Documented pass/fail for: shop create, onboarding, services, staff+hours, customers (incl. import)
- Each failure logged as a defect with repro steps and severity
- **Depends on:** Tickets 1.x, 5.x

### Ticket 4.2 — Fix surfaced workflow defects (timeboxed)
**Est:** 4-6h (timeboxed)  
**Acceptance Criteria:**
- All CRITICAL/HIGH defects from 4.1 fixed and retested
- MEDIUM/LOW triaged; deferred items logged for later weeks
- **Depends on:** Ticket 4.1

### Ticket 6.1 — Integrated E2E + isolation proof
**Est:** 3-4h  
**Acceptance Criteria:**
- Two separate shops created; neither owner can access the other's data (customers/bookings/payments)
- Full owner journey passes end-to-end
- A shared booking link opens correctly
- A real email (verification) is received
- **Depends on:** Tickets 1.x, 2.x, 3.x, 5.x

---

## Estimated Effort Summary

| Track | Tickets | Hours |
|---|---|---|
| Security (RLS) | 1.1, 1.2 | 5-7h |
| Booking link | 2.1, 2.2 | 5-7h |
| Signup/verification | 3.1, 3.2 | 5-7h |
| Email infra | 5.1, 5.2 | 4-6h |
| Workflow validation | 4.1, 4.2 | 7-10h |
| Integration | 6.1 | 3-4h |
| **Total** | **11 tickets** | **29-41h** |

Fits a 5-day sprint for 1-2 engineers, with the workflow-fix tail (4.2) as the main variable.

---

## Client / Product Owner Confirmations Needed

1. **Booking link routing** — Slug-based (`/book/inkwell-studio`, prettier, shareable) or UUID query param (`/book?shop=<uuid>`, harder to enumerate)? Affects SEO and shop-name-change behavior.
2. **Email confirmation enforcement** — Enforce email verification before access (recommended, blocks fake accounts) or allow immediate access? This changes the signup flow shape.
3. **Public booking before Mollie connected** — (Carried from milestone doc) Should a shop's public page be live before it connects Mollie, or be hidden until payout is set up? Affects the error/empty state on the booking page.
4. **Slug stability on rename** — If a shop renames itself, should old shared links keep working (requires slug history)?
5. **Email sender identity** — Confirm the `noreply@` domain and display name are correct and the domain is verified with the email provider (SPF/DKIM).

---

## Risks & Mitigations (Sprint-Level)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Workflow audit (4.1) surfaces large defect backlog | Medium | High | Timebox 4.2; defer non-blocking defects to later weeks |
| Email env access delayed | Medium | High | Request credentials Day 0; blocks verification |
| RLS fix breaks legitimate access | Low | High | Full test matrix before merge |
| Booking routing decision delayed | Medium | Medium | Default to a recommendation, proceed, adjust if needed |

---

**End of Week 1 Engineering Plan**
