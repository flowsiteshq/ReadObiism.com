# Plan: Complete edition numbering, subscription expiry, and reader search

## Context
- Search (FTS5 endpoint + reader UI) is already shipped (commits `3131ab0`, `0d2cef6`).
- Data-layer scaffolding is in place: `worker/api/src/edition-store.js` (editions/archive tables, ensureEditions, liveEdition, editionList) and `worker/api/src/pricing-store.js` (access-duration settings + `accessExpiry`).
- Remaining work: wire these into the Worker, enforce expiry everywhere, surface editions/subscriptions in admin, update reader/landing copy, publish the new manuscript as Edition 2, then deploy.

## Ordered tasks
1. **Worker integration (`worker/dashboard-worker.js`)**
   - Import `getAccessDays`, `accessExpiry`, `ensureEditions`, `liveEdition`, `editionList`.
   - Add `editionSchema` tables to the base schema string; call `ensureEditions(env)` in `ensure()`.
   - `ensurePurchaseSchema`: add `expires_at TEXT`; backfill null rows using `strftime(..., granted_at, '+N days')` with the configured duration.
   - `activePurchase`: filter `expires_at IS NULL OR expires_at > now`; add `purchaseRecord` + `accessDenied` helpers returning an `expired` code.
   - `accountPurchase`: expiry filter; add `latestAccountPurchase` (no expiry filter) for expired detection.
   - `accountAccess`: return `access`, `sessionId`, `expiresAt`, `expired`, `accessDays`.
   - Grant sites (Paystack webhook, Stripe `recordCheckoutCompletion`, `bulk-orders.js`, `bulk-local.js`): set `expires_at = accessExpiry(await getAccessDays(env))` and `edition_no = (await liveEdition(env))?.edition_no || 1`.
   - `reader()`: use `accessDenied`; include `expires_at`, `edition_label` (via purchased edition number) in license payload; reindex-safe (no change).
   - `readerSearch()`: use `accessDenied`.
   - `claim`: on inactive purchase, return `403 { code: "expired", expires_at }` when expired.
   - Admin: `/api/admin/editions` (list + live + subscription counts), purchases query includes `expires_at`, overview/readers totals become expiry-aware.

2. **Admin data (`worker/api/src/admin-data.js`)**
   - Implement `/api/admin/editions` using `editionList`, `liveEdition`, `getAccessDays`, and purchase aggregates (active/expiring-within-30-days/expired/total).
   - Add `expires_at` to the purchases query and headers.

3. **Admin UI (`dashboard/`)**
   - `payment-settings.html`: add access-duration field; update preview line.
   - New `dashboard/views/editions.html`: live edition card, archived editions table, subscription summary.
   - `alg-project-routes.js` + `dashboard-bootstrap.js` + `dashboard/index.html`: register `editions` view and nav link; bump asset versions.
   - `dashboard-controller.js`: add section handling, `loadEditions()`, pricing form submit includes `accessDays`, fill on load.

4. **Reader UI (`assets/js/custom/reader.js`)**
   - `showExpired(expiresAt)` screen with renewal link to `/#edition`.
   - `start()`: handle `403 expired` from claim/reader; `accountAccess` expired path.
   - License card/certificate: prefix `edition_label`, show `Access until …`; add `ACCESS UNTIL` detail cell.

5. **Landing copy (`index.html`, `assets/js/custom/landing.js`)**
   - Replace "one-time / No subscription" with annual-access wording.
   - Set access window from `pricing.accessDays`.

6. **Content publish (Edition 2)**
   - Commit `worker/manuscript/edition-2.json` (compiled from `new-sections-final.json`, 39 sections / 1087 paragraphs).
   - Add `worker/scripts/publish-edition.mjs`: ensure columns, archive current `book_sections` into `edition_archives`, retire prior edition, insert Edition 2 rows, update `editions`, reindex FTS via `json_each`, verify counts.
   - Run after Worker deploy; backfill `purchases.edition_no` stays 1 for prior buyers.

7. **Tests (`worker/tests/`)**
   - `pricing-store` tests: `validAccessDays`, `accessExpiry`, `validatePricing` with `accessDays`.
   - `edition-store` tests: ensure + seed, liveEdition, editionList.
   - `expiry` test: `activePurchase` returns null after expiry; `accessDenied` returns expired code.

8. **Deploy + sync**
   - Push to `main` (Workers Builds) or `cd worker; npx wrangler deploy`; report Worker Version ID.
   - `node scripts/build-pages.mjs` + gh-pages worktree sync per `docs/DEPLOYMENT.md` §10.2; report commit hash.

## Risks / notes
- SQLite date math in `strftime` must be verified against D1 before relying on backfill; test locally first.
- `admin/index.html` is a legacy duplicate workspace; at minimum keep its pricing form working by adding the same access-days field, or document that `/dashboard/` is canonical.
- Purchases without `expires_at` after backfill are treated as non-expiring by `activePurchase` (safe fallback).
- FTS reindex must run after publish or search returns stale results.
- Do not commit the manuscript PDF/text outside `worker/manuscript/` (already tracked).

## Open questions
- Should expired readers be allowed to keep reading the previously downloaded/cached content? (Recommend: no, server-enforced.)
- Should renewal reset the 365-day window from payment date or extend from prior expiry? (Recommend: from payment date.)
