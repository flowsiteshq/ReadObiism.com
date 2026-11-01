# Production Roadmap

This document tracks remaining work before production launch. Based on review of existing docs and current repo state.

## 1) Bulk Orders (BULK-ORDERS.md)
- [ ] **Production bulk checkout** - Add production bulk checkout for Stripe (USD) and Paystack (NGN). Worker must validate quantity, unit price, currency, amount, order reference, and product server-side.
- [ ] **Verified payment only** - Create order and high-entropy code only after correct verified payment or signed, idempotently processed webhook. No redirect/unverified callback can issue a code.
- [ ] **Secure code handling** - Store secure code hash for lookup. Provide appropriately protected delivery/recovery. Never put codes in URLs, logs, or public analytics.
- [ ] **Auth before claiming** - Require recipient authentication before claiming. Add verified ownership of identity before relying on it for recovery.
- [ ] **Atomic capacity checks** - Use D1 atomic transaction or equivalent DB-enforced mechanism to check capacity, insert unique claim, and grant entitlement in one batch. Prevent overselling on concurrent claims of last copy. Failed grants must not consume copies. Device transfer must not consume a second copy.
- [ ] **Order lifecycle** - Define and handle expired, refunded, cancelled, disputed, and partially refunded orders. Reconcile previously activated copies and unused capacity.
- [ ] **Audit trail & RBAC** - Record admin actions and payment events. Enforce server-side roles.
- [ ] **UI** - Add buyer confirmation and code-sharing path, recipient activation screen, and read-only dashboard (purchaser, quantity, claimed/remaining, status, payment ref). Mask codes in routine lists.
- [ ] **Testing** - Test zero/full capacity, 20 unique claims, repeated recipient retries, simultaneous final claims, partial failure/rollback, forged/duplicate payment events, refunds, account/device recovery, and both providers in isolated test environments.

## 2) Accounts, Devices & Gifts
- [ ] **Account email ownership** - Complete verified email ownership for accounts (verification flow, recovery).
- [ ] **Mobile device-transfer UI** - Implement/complete mobile device-transfer UI and flows.
- [ ] **Gift-recipient recovery** - Add gift-recipient recovery flows.
- [ ] **Secure admin roles & audit** - Harden admin auth/roles and add audit workflows.
- [ ] **Email sender config** - Configure email sending (RESEND_API_KEY and `ACCOUNT_FROM_EMAIL`/`GIFT_FROM_EMAIL`) for verification/recovery flows.

## 3) Local Bridge / Production Sync
- [ ] **Decide architecture** - Decide whether to keep the PHP bridge or move away from it.
- [ ] **If keeping bridge** - Implement authenticated sync, durable retries, conflict resolution, and verified payment handling. Define ownership model clearly.
- [ ] **Prod safety** - Ensure local/test records are never auto-copied to production. Define clear separation between local MySQL/D1 and production.

## 4) Cleanup & Housekeeping
- [ ] **Publishing alignment** - Reconcile publishing strategy. README says Cloudflare Pages via `scripts/build-pages.mjs` → `.pages-output`. PUBLISHING.md describes GitHub Pages workflow mirroring `web/` to `gh-pages`. Current repo has site files at root (no `web/` dir), no root `.github/workflows`. Pick one approach and update docs/config accordingly.
- [ ] **Worker deployment config** - Review Cloudflare Worker build settings and routes now that Worker is in `worker/` and root `wrangler.toml` points to `worker/dashboard-worker.js`. Test before pushing to production.
- [ ] **gh-pages cleanup** - `gh-pages` branch contains old full repo content (including manuscript historically). Clean on first publish/deploy per publishing strategy.
- [ ] **Git history/security** - Make repo private if not already. Audit history/branches/published artifacts. Rotate any exposed credentials (manuscript was tracked historically).
- [ ] **Tests** - Run tests (worker has tests; root package.json is a template). Fix any failing tests.
- [ ] **Docs updates** - Update PUBLISHING.md to match current structure (root-based site, build-pages.mjs, Cloudflare Pages) or implement as described.

## Notes
- Full manuscript is not tracked in git HEAD (only exists locally in `worker/manuscript/` and is gitignored).
- Recent commit: `520dda9 chore: update admin UI to show production status`
- Worker in `worker/`, site files at root, admin/dashboard/assets present.
