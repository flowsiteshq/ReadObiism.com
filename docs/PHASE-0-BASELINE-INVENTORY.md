# OBI-ISM Phase 0 baseline inventory

**Captured:** 31 October 2026
**Supports:** `OBI-ISM-WEB-MOBILE-ARCHITECTURE-AND-BRANCH-PLAN.md` §2, §5, §11 Phase 0
**Nature:** read-only observation. No commit, push, deploy, migration or destructive command was run while producing this document.

## 1. Branch topology (verified)

There are **two remote branches**: `main` and `gh-pages`. A third local branch exists but has no commits of its own.

| Worktree | Branch | HEAD | Remote | Working tree |
| --- | --- | --- | --- | --- |
| `readobiism.app` | `main` | `230e990` | `origin/main` at `230e990` | dirty: 25 modified, 27 untracked files |
| `readobiism-site` | `gh-pages` | `ff41b22` | `origin/gh-pages` at `ff41b22` | dirty: 7 modified, 13 untracked files |
| `obiism-rebuild` | `feature/obi-web-rebuild` | `230e990` | none (local only) | dirty: 25 modified, 108 untracked files |

`feature/obi-web-rebuild` points at the **same commit as `main`**. Its 133 dirty files are the entire rebuild so far; they exist in no commit, on no remote, and in no backup. This is the single largest preservation risk in the project.

`main` and `gh-pages` share merge-base `76ae703` and then diverge: `main` carries the Expo app and Worker, `gh-pages` carries the static site. They are not fast-forwardable and must not be merged as wholes.

## 2. What is uncommitted

### `main` (`readobiism.app`)

- Worker and API: `dashboard-worker.js` (+661 lines), plus `tests/device-transfer.test.ts`, `tests/gift.test.ts`, `tests/pwa-security.test.ts`, `tests/rate-limit.test.ts`, `tests/reader-security.test.ts`, `scripts/verify-d1-sections.mjs`.
- Mobile: `app/reader.tsx`, `app/(tabs)/*`, `components/edition-access-card.tsx`, `components/app-screen.tsx`, `lib/entitlement.ts`, `lib/use-edition.ts`, `app/+html.tsx`, `public/` (manifest, service worker, icons), `app.config.ts`.
- Content refactor: `lib/book-data.ts` (−1,167 lines net), `lib/publication-data.ts`, `scripts/import-manuscript.mjs`, `tests/book-data.test.ts`.
- Tooling and docs: `package.json`, `tsconfig.json`, `.gitignore`, `DEVICE-TRANSFER-ROLL-OUT.md`, `WEB-LAUNCH-CHECKLIST.txt`, `FIXES-TO-MATCH-PROPOSAL.txt`, `scripts/verify-web-export.mjs`.

### `gh-pages` (`readobiism-site`)

- Modified: `index.html` (+172), `reader.html` (+162), `app/website.tsx`, `CNAME`, `delete-account.html`, `login.html`, `privacy.html`.
- New: `redeem.html`, `gift-confirmation.html`, `terms.html`, `refund.html`, `404.html`, favicons and app icons, store badges.

### `feature/obi-web-rebuild` (`obiism-rebuild`)

- 25 modified files that are byte-identical copies of the `main` worktree files (verified by SHA-256), including `app/reader.tsx`, `lib/entitlement.ts`, `components/edition-access-card.tsx`, `public/`, and the new tests.
- `web/`: 46 files — the static site copied from `readobiism-site` with CSS/JS extracted into `web/assets/css/pages/`, `web/assets/js/pages/` and a shared `web/assets/js/obi-api.js`.
- `api/src/`: extracted `validation.js`, `security.js`, `admin-auth.js`, `admin-data.js`; `dashboard-worker.js` imports them and routes `/api/admin/*`.
- `database/`: review-only `0001_local_schema_baseline.sql` and a synthetic fixture.
- `docs/`: `REBUILD-PROGRESS.md`, `BULK-ORDERS.md`.
- `web/admin/`: read-only admin UI (login, dashboard, Chart.js vendor copy).
- 18 verification/setup scripts and 10 additional test files.

Two files in the rebuild intentionally differ from `main`:
- `dashboard-worker.js`: imports the extracted helpers and adds the admin route (expected refactor).
- `package.json`: adds `dev:rebuild:*` and DB-mirror scripts.

## 3. Preservation evidence (re-run 31 Oct 2026)

The source-parity scripts compare the rebuild copy against the live dirty source worktree, not against a commit:

```
Landing matches the current source apart from extraction and the shared API client.
login: source matches except for extraction and the shared API client.
reader: source matches except for extraction and the shared API client.
redeem: source matches except for the shared API client.
gift-confirmation: source matches except for the shared API client.
```

This confirms the rebuild's `web/` is not stale relative to `readobiism-site`, and that only the reviewed extraction/API-client changes are present.

Secret scan of the rebuild found only placeholder/test values (`sk_test_…`, `whsec_…` in tests and input placeholders). No `.env` file, live key, token or database dump is present in the rebuild tree. The manuscript remains a tracked source file (`manuscript/obi-ism-manuscript.txt`, 489 KB) and must stay out of public artifacts.

## 4. Deployed state (probed)

- `https://readobiism.com` serves the site; `/api/health` responds.
- Live worker is approximately `d1e7ab4`. Commit `230e990` (first-device binding) and all local gift/transfer/admin work are **not live**.
- `http://readobiism.com` returns 200 without redirecting to HTTPS.
- Live 404s include `/redeem.html`, `/gift-confirmation.html`, `/terms.html`, `/refund.html`, `/404.html`, `/manifest.json`, `/sw.js`.
- `gh-pages` at `ff41b22` is behind the dirty site worktree, so the new pages are not published.

## 5. Gaps against the plan

| Plan requirement | Actual |
| --- | --- |
| Phase 0 inventory and recovery point | This document; no commit/backup of the 133 rebuild files yet |
| `main` source of reviewed release artifacts | `main` cannot be rebuilt from commits; current mobile/API state exists only in the working tree |
| `gh-pages` = built, approved artifacts only | `gh-pages` is still hand-edited source and is behind local changes |
| Cloudflare production gate | Not verified; `main` is still described as the deploy branch, so any push can deploy the Worker |
| Single web source of truth | Rebuild `web/` is a verified copy, but it is uncommitted and not yet the source |
| Versioned migrations | Local baseline only, explicitly not compared with production D1 |
| Verified account ownership | Not implemented; account access still keys on email text |
| Admin V1 | Read-only local UI only, undeployed, single-password auth |

## 6. Recommended harmonization sequence

Do **not** push during any of these steps. Pushing `main` can deploy the Worker; pushing `gh-pages` can publish the site.

1. **Checkpoint `main` locally** in four reviewable commits, without pushing:
   - `refactor(content): serve the edition from the Worker, stop bundling the manuscript`
   - `feat(api): accounts, device transfer, gifts, rate limits and security tests`
   - `feat(mobile): account access, entitlement hook and PWA shell`
   - `chore: local verification scripts and launch checklists`
2. **Checkpoint `gh-pages` locally** in two commits: gift/transfer pages, then legal/404/icon assets. Confirm GitHub Pages publishing source before any push.
3. **Checkpoint `feature/obi-web-rebuild`** in layers, based on the same file states:
   - copied baseline snapshot (must match step 1 and 2 trees by hash)
   - `web/` migration and CSS/JS extraction
   - Worker module extraction and `/api/admin/*`
   - database baseline and fixtures
   - docs, scripts and tests
4. **Tag the checkpoints** (`checkpoint/phase0-main`, `checkpoint/phase0-site`, `checkpoint/phase0-rebuild`) and push only the tags or the feature branch after review; never force-push.
5. **Verify the Cloudflare gate** in the dashboard (build token warning, production branch, deploy command, watch paths) before `main` is ever pushed.
6. **Then start Phase 1**: keep entry points where they are, add environment examples, a migration runner and one stable local origin. Do not move `app/` or `dashboard-worker.js` yet.

### Commit-boundary caution

`lib/book-data.ts` losing ~1,167 lines is a behavioural change (content now comes from D1), not formatting. It belongs in its own commit so it can be reverted independently of the Worker and mobile UI changes.

The rebuild's 25 copied `main` files should not be committed as "rebuild work" before `main` itself is checkpointed; otherwise the same change has two unrelated origins and later merges become ambiguous.

## 7. Decisions still needed

1. Approve the local checkpoint commits (no push) so the rebuild stops being unbacked-up.
2. Confirm GitHub Pages source (branch/folder or Actions) and whether `gh-pages` may receive a push after review.
3. Confirm the Cloudflare production trigger and who can change it.
4. Decide whether the read-only admin UI ships as-is for internal use or waits for role-based auth.
5. Approve the Phase 1 local-origin decision (`http://127.0.0.1:5514` per the rebuild scripts) before any reader-bound testing.

## 8. Execution record (31 October 2026)

The checkpoint was executed locally. Nothing was pushed, deployed or published.

- `main` advanced from `230e990` to `d5d3a09` in nine commits: API split, mobile/PWA, admin UI, web migration, database baseline, tooling, docs, schema-test fix, and LF normalisation.
- Tag `checkpoint/phase0-main` marks the result. `checkpoint/pre-harmonize-main` and `checkpoint/pre-harmonize-gh-pages` mark the previous revisions.
- `feature/obi-web-rebuild` was merged into `main` (fast-forward content) and deleted. Its worktree is deregistered; the directory still exists because a running Wrangler process holds a cache file.
- `gh-pages` remains at `ff41b22` with its 20 dirty files untouched. It is now superseded by `main`/`web/`.
- Dirty-file backup: `_backups/phase0-2026-10-31/` (52 `main` files, 20 `gh-pages` files, both patches).
- Verification on the unified `main`: 68 tests passed, 1 skipped; `tsc --noEmit` clean; all five parity checks pass; `wrangler deploy --dry-run` bundles 66.44 KiB with the `OBI_DB` binding.

Remaining before any push: fix the Cloudflare production gate, decide the GitHub Pages source, and retire `gh-pages` as a source branch.

