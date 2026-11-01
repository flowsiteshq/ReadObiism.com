# Publishing the web app

The site files live at the repository root (not in a `web/` directory). 

## Cloudflare Pages (current approach)

Per `README.md` and `scripts/build-pages.mjs`:

1. Build the publishable output: `node scripts/build-pages.mjs`
2. This creates `.pages-output/` containing only the website files (HTML, CSS, JS, images, fonts, etc.)
3. In Cloudflare Pages, set the build command to `node scripts/build-pages.mjs` and the output directory to `.pages-output`
4. Do **not** publish the repository root directly

The build script:
- Copies root HTML files (and selected extensions) except `package.json` and forbidden files
- Copies directories: `assets`, `admin`, `auth`, `dashboard` (recursively)
- Excludes dotfiles, maps, and common server/credential files (`.php`, `.sql`, `.sqlite`, `.db`, `.pem`, `.key`, `.p12`, `.pfx`, `.log`, `.bak`)

## GitHub Pages (`gh-pages` branch)

A `gh-pages` branch exists remotely. Note that historically it contained the full repository (including files that should not be public). Any publishing to `gh-pages` must be done carefully.

If using GitHub Pages, ensure only the built site is published. The `gh-pages` branch currently needs cleanup before first publish - it may contain old repo content that should be removed.

## Ordering rule

Publish the site only after the Worker that the site calls is deployed. The gift and device-transfer pages call endpoints that must exist in production. Deploying/publishing before the Worker is ready can break those flows.

Recommended order:
1. Deploy the compatible Worker (including gift, transfer, and account endpoints).
2. Verify `/api/health` and the new endpoints.
3. Build and publish the site (`.pages-output/` for Cloudflare Pages, or cleaned `gh-pages` for GitHub Pages).
4. Verify `readobiism.com/redeem.html`, `/gift-confirmation.html`, and the reader.

## Rollback

For Cloudflare Pages, rollback via the Pages deployment history. For GitHub Pages, revert the commit on `gh-pages` and push it. Do not force-push `main`.
