# Clean URLs without `.html`

## Why `.htaccess` does not work here

`.htaccess` is an Apache web-server feature. The public site is currently served by **GitHub Pages** from the `gh-pages` branch. GitHub Pages does not read `.htaccess`, `web.config`, `_redirects`, or any other server-side rewrite file.

There are three practical options.

## Option A — Cloudflare URL Rewrite (recommended for the current site)

The `readobiism.com` zone is already proxied through Cloudflare, and `/api/*` is routed to the Worker. Cloudflare Rules are the closest equivalent to `.htaccess` for this setup.

### 1. Rewrite clean URLs to `.html`

Cloudflare dashboard → **Rules → Transform Rules → URL Rewrite** → **Create rule**.

- **Name:** `Pretty page URLs`
- **When incoming requests match:** Custom filter expression:

```text
(http.request.uri.path matches "^/[A-Za-z0-9_-]+$" and not http.request.uri.path in {"/admin" "/dashboard" "/assets" "/api"})
```

- **Rewrite to:** Dynamic
- **Expression:**

```text
concat(http.request.uri.path, ".html")
```

This makes:

```text
https://readobiism.com/login      → serves /login.html
https://readobiism.com/reader     → serves /reader.html
https://readobiism.com/terms      → serves /terms.html
```

The browser address stays `/login`, `/reader`, etc.

The exclusions protect:

- `/api/*` — the Worker API
- `/assets/*` — CSS, JS and images
- `/admin` and `/dashboard` — directory frontends
- paths containing a dot or a slash, such as `.css`, `.js`, `/assets/...`

### 2. Redirect old `.html` URLs to the clean URL (optional but recommended)

Use **Rules → Redirect Rules → Bulk Redirects** with a list:

| Source | Target | Status |
| --- | --- | --- |
| `/login.html` | `/login` | 301 |
| `/reader.html` | `/reader` | 301 |
| `/terms.html` | `/terms` | 301 |
| `/privacy.html` | `/privacy` | 301 |
| `/refund.html` | `/refund` | 301 |
| `/delete-account.html` | `/delete-account` | 301 |
| `/redeem.html` | `/redeem` | 301 |
| `/gift-confirmation.html` | `/gift-confirmation` | 301 |
| `/bulk.html` | `/bulk` | 301 |
| `/bulk-redeem.html` | `/bulk-redeem` | 301 |
| `/bulk-confirmation.html` | `/bulk-confirmation` | 301 |
| `/verify-email.html` | `/verify-email` | 301 |
| `/index.html` | `/` | 301 |
| `/404.html` | `/404` | 301 |

Enable **Preserve query string** so links such as `/reader.html?session_id=obi_...` keep their session.

A dynamic Redirect Rule can also do this with a regular expression, but Bulk Redirects are easier to audit and avoid expression-syntax mistakes.

### 3. Keep the files

Do **not** delete the `.html` files. The rewrite points at them. This also keeps old bookmarks working through the 301.

## Option B — Cloudflare Pages

If you later move the site from GitHub Pages to **Cloudflare Pages**, use the included `_redirects` file:

```text
/login /login.html 200
/reader /reader.html 200
...
```

Cloudflare Pages reads `_redirects` at deploy time. The repository already contains this file, and `scripts/build-pages.mjs` copies it into `.pages-output`.

`_redirects` is ignored by GitHub Pages, so it is harmless while the site remains there.

## Option C — Directory-style URLs on GitHub Pages

GitHub Pages automatically serves:

```text
/about/index.html  →  /about/
```

To remove `.html` without Cloudflare, every page would need to move into its own directory and all relative asset links would need to become root-absolute (`/assets/...`). This is more work and changes every URL; it is not recommended while Cloudflare Rules are available.

## Test checklist

After enabling the Cloudflare rules:

- `https://readobiism.com/login` loads the sign-in page and stays `/login`
- `https://readobiism.com/reader` loads the reader
- `https://readobiism.com/reader.html` redirects to `/reader`
- `https://readobiism.com/login.html` redirects to `/login`
- `https://readobiism.com/api/health` still returns `{"status":"ok",...}`
- `https://readobiism.com/assets/css/custom/landing.css` still loads
- `https://readobiism.com/admin/` and `/dashboard/` still work
- `/reader?session_id=obi_...` preserves the query string

## Notes

- Cloudflare Rules apply before the GitHub Pages origin; the `.html` files remain the source.
- The Worker route `/api/*` is not affected because `/api/...` contains a slash and `/api` is explicitly excluded.
- After the rules are live, internal links can be updated from `login.html` to `/login`, but this is optional thanks to the 301 redirects.
- Never delete the `.html` source files; they are what the rewrite serves.
