# Publishing the web app

Last verified: **2026-11-02**. For the full operational guide, see **`docs/DEPLOYMENT.md`**.

The site files live at the repository root (not in a `web/` directory). Production uses two independent targets:

- **Static site:** GitHub Pages from the `gh-pages` branch, custom domain `readobiism.com` (`CNAME`).
- **API:** Cloudflare Worker `steep-leaf-f57d` (source `worker/dashboard-worker.js`, D1 `obi-ism-payments`), bound to `readobiism.com/api/*` by a Worker route.

There is **no Cloudflare Pages project**.

## Build the publishable artifact

```powershell
node scripts/build-pages.mjs
```

This creates `.pages-output/` containing only the website files (HTML, CSS, JS, images, fonts, etc.), plus `CNAME`, `.nojekyll`, `_headers`, and `_redirects` when present. Backend, mobile, dotfiles, maps, PHP, SQL, databases, keys, logs, and backups are excluded. `.pages-output/` is Git-ignored.

Do **not** publish the repository root.

## Publish the site

Publish the Worker first, then the site. The gift, device-transfer, and account pages call endpoints that must already exist in production.

1. Deploy the Worker (push `main`, or `cd worker; npx wrangler deploy`).
2. Verify `https://readobiism.com/api/health` and any new endpoints.
3. Build the artifact with `node scripts/build-pages.mjs`.
4. Sync `.pages-output` into a fresh worktree based on `origin/gh-pages` and push it. The exact commands are in `docs/DEPLOYMENT.md`, section 10.2.
5. Verify `readobiism.com`, `/redeem.html`, `/gift-confirmation.html`, and the reader.

For a Worker-only change, the site does not need new content. The project convention is an empty "Republish website..." commit on top of `origin/gh-pages` to trigger a Pages rebuild; see `docs/DEPLOYMENT.md`, section 10.1.

## Rules

- The local `gh-pages` branch and the old worktree at `C:\Users\FAVOUR\Documents\read_obi_ebook\readobiism-site` are stale. Base publishing on `origin/gh-pages`.
- Do not force-push `main` or `gh-pages`.
- `_headers` is a Cloudflare Pages convention; GitHub Pages ignores it. Configure security headers at the Cloudflare zone if needed.
- Re-audit the published tree before any publish. Never publish source, manuscripts, credentials, or database files.

## Rollback

- **Worker:** redeploy the previous version from the Cloudflare dashboard's deployment history, or revert the commit on `main` and push.
- **Site:** revert the bad commit on `gh-pages` and push. Do not force-push.
