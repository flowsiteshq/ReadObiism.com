# Production Roadmap

Last reviewed: 2 November 2026. `[x]` means the whole item is complete; `[ ]` means work or verification remains. "Local" means changes exist in the workspace, not necessarily on the deployed site.

**Current launch gate:** Production bulk checkout, verification and claims are disabled in the local Worker code until payment, recovery, lifecycle and deployment checks are complete. The current workspace is missing `worker/.dev.vars`, so the full local stack cannot start until local configuration is restored. Do not push or deploy until the Worker and Pages settings have been reviewed.

## Completed work in the local workspace

These checks mark individual pieces already implemented; the broader launch requirements below stay open until the whole flow is finished and verified.

- [x] Chose PHP/MySQL for local testing and Cloudflare Worker/D1 for live data.
- [x] Updated `docs/PUBLISHING.md` with the Cloudflare Pages build and output directory.
- [x] Added the bulk-order link to the landing page and marked it coming soon.
- [x] Built the bulk buyer, confirmation and recipient activation screens; added an admin discount-approval preview. Production checkout and approval controls are not yet enabled.
- [x] Added local code for encrypted bulk-code recovery and reader-compatible bulk claim references.
- [x] Added local protections that disable unfinished production bulk routes and reject buyer-supplied discounts.
- [x] Improved account verification request limits and email-delivery error handling locally.
- [x] Added targeted Worker and UI tests using simulated gateways and SQLite. Real provider, browser/device and Cloudflare D1 testing remain open.
## 1) Bulk orders

- [ ] **Production checkout:** Complete and enable Stripe (USD) and Paystack (NGN) checkout with server-side validation of quantity, price, currency, amount, reference and product. Implement an administrator-approved discount workflow; buyers must not approve their own discounts. Local provider code exists, but the production routes remain disabled.
- [ ] **Verified payment only:** Complete signed, idempotent webhook and provider verification for both gateways; ensure redirects cannot issue a code. Paystack and Stripe verification code exists locally, but the complete production flow has not been verified.
- [ ] **Secure code handling:** Complete protected code delivery and buyer recovery, audit URLs/logs/analytics, and configure the encryption key securely. Code hashing and encrypted recovery exist locally; key management and end-to-end recovery remain open. See `docs/BULK-CODE-RECOVERY.md`.
- [ ] **Authentication before claiming:** Require recipient sign-in and verify account email ownership before relying on it for recovery. Claim authentication exists, but verified ownership and the full recovery flow remain incomplete.
- [ ] **Atomic capacity checks:** Verify D1's claim, entitlement and device operations under real concurrent requests. Local SQLite tests cover 20 claims, retries and a simulated rollback, but do not prove Cloudflare D1 concurrency or device-transfer behavior.
- [ ] **Order lifecycle:** Handle expiry, cancellation, refunds, partial refunds and disputes, and reconcile active editions and unused capacity.
- [ ] **Audit trail and roles:** Complete server-side administrator roles and record payment and management actions. A basic admin audit log exists.
- [ ] **UI:** Connect and test the buyer, confirmation, recipient activation, code-sharing and read-only admin views. The buyer and recipient pages exist; the discount-approval controls are a disabled preview and the production routes remain disabled.
- [ ] **Testing:** Test both providers in isolated environments, forged and duplicate events, zero/full capacity, concurrent final claims, rollback, refunds, and account/device recovery. Local tests use simulated gateways and SQLite; they are not production gateway or D1 tests.

## 2) Accounts, devices and gifts

- [ ] **Email ownership:** Complete the verified-email user journey and account recovery. Verification endpoints and limited delivery/error handling exist locally; the full flow is not verified.
- [ ] **Mobile device transfer:** Implement and test the mobile UI and transfer flow.
- [ ] **Gift-recipient recovery:** Complete and test recipient recovery.
- [ ] **Administrator roles and audit:** Harden admin authentication, implement roles and complete audit workflows.
- [ ] **Email sender:** Configure and test `RESEND_API_KEY` and `ACCOUNT_FROM_EMAIL` / `GIFT_FROM_EMAIL` in the intended environment.

## 3) Local bridge and production data

- [x] **Architecture decision:** Keep the PHP/MySQL bridge for local testing; use the Cloudflare Worker and D1 for live data. This decision does not imply that every feature has a MySQL-first implementation.
- [ ] **Local bridge completeness:** Complete and test the local ownership model, authenticated synchronization, durable retries, conflict handling and verified payment behavior as needed. Reader accounts have a MySQL-first local path; other features still use the local Worker/D1.
- [ ] **Production separation:** Verify the deployed configuration cannot copy local test accounts, purchases or database records to production. Local and production databases are intended to be separate; deployment verification remains open.

## 4) Deployment and housekeeping

- [ ] **Publishing alignment:** Verify Cloudflare Pages builds the root website using `node scripts/build-pages.mjs` and publishes only `.pages-output`; review the deployed artifact and domain routing. The documentation describes this approach, but the live setup has not been confirmed.
- [ ] **Worker deployment:** Review Cloudflare build root, `wrangler.toml`, D1 binding, secrets and `/api/*` route; test a compatible deployment before changing production.
- [ ] **`gh-pages` cleanup:** Review and clean or retire the old branch and any published artifacts as part of the chosen publishing strategy.
- [ ] **Git history and security:** Make the repository private, audit history, branches and published artifacts, and rotate exposed credentials. The manuscript was tracked historically; ignoring a file does not erase history.
- [ ] **Tests:** Restore and run the full test suite, including provider, browser, device and D1 checks. Targeted Worker and UI tests exist, but they do not cover all launch requirements. Run `npm test` in `worker/` and `node --test tests/bulk-ui.test.mjs` at the workspace root.
- [x] **Publishing documentation:** `docs/PUBLISHING.md` describes the root website, `scripts/build-pages.mjs` and Cloudflare Pages output. The deployment itself remains a separate open item above.

## Notes

- The manuscript is not tracked in the current Git HEAD, but it remains in repository history and must not be published.
- The landing page includes a bulk-orders link marked coming soon. The bulk buyer page has a local design-preview mode; this does not enable payments.
- Production bulk functionality must stay disabled until the remaining payment, security, migration and testing gates are cleared.