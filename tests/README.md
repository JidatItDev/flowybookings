# Test layout

Three kinds of test, three homes. Pick the one that matches what you're actually verifying — don't default to the first one you learned.

## 1. Unit — `src/**/__tests__/*.test.ts`

One `__tests__/` subfolder per feature folder, e.g. `src/shop/billing/server/__tests__/cancel-outcome.test.ts` tests `src/shop/billing/server/cancel-outcome.ts`. Still lives right next to the code (one level down, same parent), but keeps the feature folder's own listing source-only instead of interleaving `*.ts` and `*.test.ts` — most feature folders in this repo (e.g. `shop/billing/server/`) already have 10+ source files, so that matters. For pure functions with no I/O, or a function with one unavoidable external call mocked inline (e.g. `mollie-subscriptions.test.ts` mocking `mollieFetchWithFallback`).

Rule of thumb: if the mock setup at the top of the file is pushing past ~10 lines, it's not a unit test anymore — move it to `tests/integration/`.

Run: `npm run test:unit`

## 2. Integration — `tests/integration/<path mirroring src>/*.integration.test.ts`

For a full route handler exercised end-to-end against faked dependencies — e.g. a future `tests/integration/shop/billing/server/plan-cancel.integration.test.ts` calls `handlers.POST({ request })` against a fake `supabaseAdmin` and asserts on the real HTTP response plus which DB calls were made.

These live outside `src/` because they need shared fakes from `tests/support/` (a fake Supabase client, fake Mollie responses) that multiple integration tests reuse — that scaffolding doesn't belong mixed into application code. The `.integration.test.ts` suffix keeps them out of the fast unit loop and lets CI run them as a separate, slower step.

Run: `npm run test:integration`

*(Nothing lives here yet — this repo's first integration test hasn't been written. When you add one, also add whatever shared fake it needs under `tests/support/`.)*

## 3. Manual — `tests/manual/*.md`

Checklists for what can't be automated because it needs a real round trip to a third party (a real Mollie test-mode checkout, a real webhook delivery). Each file is a scenario table, checked off per verification pass — see `tests/manual/billing-checkout.md`.

## Everything else

`npm test` runs unit + integration together (whatever exists under `src/` and `tests/integration/`). Manual checklists are never picked up by vitest (they're markdown, not `*.test.ts`) — check them off by hand.
