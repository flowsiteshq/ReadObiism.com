# OBI-ISM workspace

The website is at the workspace root. `readobi-api/` contains the local PHP/MySQL integration, `readobi-mobile/` the Expo app, and `worker/` the Cloudflare Worker and D1 configuration. The root `index.html` is the landing page.

## Local development

Start MySQL in XAMPP, then double-click `start-local-stack.cmd`. This starts the Worker, PHP bridge and web proxy from this workspace. Open http://127.0.0.1:5514/. Five Server on any `127.0.0.1` port can use the local API too; this trusts other local HTTP services on those ports, so use it only on a development computer. Use port 5514 for checkout and device-bound reader tests. Stop or restart local services when changing Worker settings. Logs are in `worker/.wrangler/local-stack-logs/`.

The Worker uses `worker/.dev.vars` and `worker/.wrangler/rebuild-state/` for local credentials and local D1 data. These are ignored by Git. Local MySQL and D1 are separate from production. Only reader account registration uses the local MySQL-first flow; payment and reader operations use local D1. Local records do not sync to production. `worker/manuscript/` and `.local-backup/` are private, Git-ignored references and must not be published. The retained backup includes sensitive source and must be handled accordingly.

Worker dependencies are installed with `npm install` inside `worker/`. To refresh the one-way phpMyAdmin mirror from local D1, run `npm run mirror` from `worker/`; this is for inspection only.

## Deployment

Do not publish the repository root directly. Cloudflare Pages must serve only the verified website output: run `node scripts/build-pages.mjs` and inspect `.pages-output`. For Pages, use that build command and `.pages-output` as the output directory. The script excludes backend, mobile, dotfiles and common server/credential files, but does not replace a security or content audit.

The live Worker remains separate. Its source and `wrangler.toml` are now in `worker/`, so any future Worker build must use that folder as its root. The existing production build still expects files at the old repository root. **Do not push this rearrangement to production main** until Worker build settings and routes are reviewed and the new deployment is tested. Keep `readobiism.com/api/*` connected to the correct Worker.

Make the GitHub repository private. Its existing history contains a manuscript; `.gitignore` cannot erase tracked files or history or undo previous exposure. Audit history, branches and published artifacts, and rotate any exposed credentials before release.
