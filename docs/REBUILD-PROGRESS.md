# OBI-ISM rebuild progress

**Branch:** `feature/obi-web-rebuild`  
**Baseline:** `main` at `230e990`  
**Status:** committed locally; not pushed, published or deployed.

## Completed foundation

- Copied the existing standalone site into `web/` without moving or overwriting the `gh-pages` worktree. Initial copies of 31 files matched the source by SHA-256.
- Extracted the landing, sign-in and reader CSS/JavaScript into page files; consolidated their API connection and the gift pages' API connection into `web/assets/js/obi-api.js`. Source-parity scripts verify the explicitly allowed transformations. Screen-by-screen visual and interaction testing remains required.
- Copied 25 modified and 27 untracked non-ignored files from the `main` worktree, after checking both worktrees shared the same commit and the destination had no tracked edits. The copied files matched by SHA-256 before the intentional rebuild changes. Environment files, local D1 state, and dependencies were not copied as source files.
- Kept Expo and the Worker at their existing root paths to avoid silently breaking mobile configuration or Cloudflare's current root/entry point. Extracted Worker validation and low-level security helpers into `api/src/`, retaining the existing exported API and token hash format. Do not deploy this branch automatically.
- Generated a **review-only** local D1 schema baseline. It has been checked against the local Worker schema in an empty SQLite database; it has not been compared with production and must not be blindly applied to any existing D1 database.
- Added a separate local proxy and npm commands for the rebuild. By default they use the local Worker on `127.0.0.1:8799`, local site on `127.0.0.1:5514`, and `.wrangler/rebuild-state`. The proxy refuses a remote API without an explicit opt-in.
- In that isolated database, a synthetic test account, synthetic purchase and a single sample paragraph were used to verify registration, cookie-backed sign-in, licence claim and protected section retrieval through the site proxy. No real payment, production D1 or manuscript was used.
- Full tests: 57 passed, one pre-existing skipped; TypeScript check passed. Page-behavior tests use simulated DOM and API responses to check currency selection, gift mode, authentication tabs, section loading and the mobile chapter toggle. They do not validate actual browser rendering or real payment/email providers. Worker bundling passed Wrangler's `--dry-run`; no deployment occurred. Wrangler 3 warned that it falls back to an older supported compatibility date in its local runtime; this must be resolved and re-tested before release.

## Next gates

1. Review the copied changes with the owner. They are now preserved in local commits on this branch; nothing has been pushed, published or deployed. Secret and publication-boundary checks passed before committing.
2. Visually compare landing, sign-in, reader and other states on desktop, tablet and mobile. Verify real browser navigation, video, accessibility and payment selection. Automated source parity is not a visual approval. Browser-control screenshots on 31 October 2026 showed a different active window from the selected OBI-ISM accessibility state, so the comparison is not yet complete.
3. Confirm the live GitHub Pages source, Worker version/routes and actual production D1 schema; document Cloudflare branch gating and backup/restore. The schema baseline is local-only until then.
4. Complete account email ownership, mobile device-transfer UI, gift-recipient recovery and secure admin roles/audit workflows. Set up an isolated staging Worker/D1, test payment callbacks/webhooks and email before real end-to-end tests. See `DEVICE-TRANSFER-ROLL-OUT.md`.
5. Build a public-only artifact pipeline and evaluate module/file moves in backward-compatible stages. Do not merge to `main`, publish `gh-pages` or deploy production until the owner reviews the concrete release and Cloudflare's automatic production deploy behavior is gated.
