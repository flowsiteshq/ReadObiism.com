# OBI-ISM web application: migration baseline

This directory is the first design-preserving copy of the standalone web experience from the `readobiism-site` worktree. It is a development baseline on `feature/obi-web-rebuild`, not a production release. The source worktree contains uncommitted changes and remains untouched.

The landing page, sign-in, reader, gift pages, legal pages, and their current public assets were copied before CSS or JavaScript extraction. The copies were verified byte-for-byte against the source. The landing, sign-in and reader now load their styles and scripts from `assets/css/pages/` and `assets/js/pages/`, in the same order. Those pages and the gift pages use the common `assets/js/obi-api.js` client, with the same original endpoint, token and credential behavior. `node scripts/verify-landing-parity.mjs`, `node scripts/verify-reader-auth-parity.mjs` and `node scripts/verify-gift-api-parity.mjs` compare the source worktree against the extracted markup, CSS and the explicitly reviewed API-client change; they detect source changes as well as unexpected differences. `pnpm test` includes the API-client tests. These checks do not replace visual or interaction testing.

Preserve the rendered appearance and behavior when organizing files. Obtain owner approval for intentional visual changes and record desktop, tablet, mobile, and interaction-state comparisons before release. Gift and legal pages have not been extracted yet.

## Intended organization

As the migration proceeds, separate shared configuration and API access, page-specific JavaScript, and styles into maintainable modules. Move content in small verified steps; preserve script order, relative paths, navigation and checkout semantics. The static website must not include manuscript text, secrets, database files, private environment configuration or server-side code.

## Local preview

From the rebuild repository root, use two terminals:

```powershell
pnpm.cmd dev:rebuild:worker
pnpm.cmd dev:rebuild:web
```

The isolated local Worker uses port 8799 and `.wrangler/rebuild-state`; the web proxy uses `http://127.0.0.1:5514/`. The proxy defaults to the local Worker and refuses a remote API unless `OBI_ALLOW_REMOTE_API=1` is explicitly set. Wrangler's local D1 state is separate from the existing development database and the live D1 database. A separate browser origin has separate local storage, so device-bound reader access may require test-specific recovery. Do not use live accounts or real payments to test it.

The isolated test database initially has no production manuscript or real purchases. A synthetic account/purchase/chapter integration was verified during this rebuild; see `../database/README.md` for the limited local fixture. The fixture is not production data.

The Expo mobile source and Worker remain at their existing paths in this worktree for now. The modified and untracked files from the separate `main` worktree were copied into this branch after checking both worktrees shared the same baseline; they were verified by file hash. Those changes still require individual review and integration testing before this branch can be treated as a complete replacement. No secrets or local D1 state were copied.

Do not publish this directory directly until the GitHub Pages source, artifact allowlist, backend compatibility, release controls and rollback process have been reviewed.
