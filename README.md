# OBI-ISM workspace

The website is at the workspace root. `readobi-api/` contains the local PHP/MySQL integration, `readobi-mobile/` the Expo app, and `worker/` the Cloudflare Worker and D1 configuration. The root `index.html` is the landing page.

## Local development

Start MySQL in XAMPP, then double-click `start-local-stack.cmd`. This starts the Worker, PHP bridge and web proxy from this workspace. Open http://127.0.0.1:5514/. Five Server on any `127.0.0.1` port can use the local API too; this trusts other local HTTP services on those ports, so use it only on a development computer. Use port 5514 for checkout and device-bound reader tests. Stop or restart local services when changing Worker settings. Logs are in `worker/.wrangler/local-stack-logs/`.

The Worker uses `worker/.dev.vars` and `worker/.wrangler/rebuild-state/` for local credentials and local D1 data. These are ignored by Git. Local MySQL and D1 are separate from production. Only reader account registration uses the local MySQL-first flow; payment and reader operations use local D1. Local records do not sync to production. `worker/manuscript/` and `.local-backup/` are private, Git-ignored references and must not be published. The retained backup includes sensitive source and must be handled accordingly.

Worker dependencies are installed with `npm install` inside `worker/`. To refresh the one-way phpMyAdmin mirror from local D1, run `npm run mirror` from `worker/`; this is for inspection only.

## Deployment

Production has two independent targets:

- **API Worker:** `steep-leaf-f57d`, source `worker/dashboard-worker.js`, D1 `obi-ism-payments`, bound to `readobiism.com/api/*`. Every push to `main` is deployed automatically by Cloudflare Workers Builds.
- **Static site:** GitHub Pages from the `gh-pages` branch, custom domain `readobiism.com`. Build the publishable output with `node scripts/build-pages.mjs` (output: `.pages-output/`).

There is no Cloudflare Pages project. Do not publish the repository root. See **`docs/DEPLOYMENT.md`** for account IDs, Wrangler and GitHub setup, deploy/publish commands, the Workers Builds token repair, secrets, D1 operations, verification, and troubleshooting. `docs/PUBLISHING.md` covers the site publish order.

Make the GitHub repository private. Its existing history contains a manuscript; `.gitignore` cannot erase tracked files or history or undo previous exposure. Audit history, branches and published artifacts, and rotate any exposed credentials before release.
