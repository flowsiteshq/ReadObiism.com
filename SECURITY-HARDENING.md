# Security Hardening Plan

This covers protecting against source inspection, console-based extraction, repo leaks, and adding PWA safely.

## 1) Prevent source/repo/code exposure
- [ ] **Make repo private** (GitHub). If public, make private immediately.
- [ ] **Audit git history** for secrets/manuscript. The manuscript was tracked historically; consider `git filter-repo`/BFG to purge if it was exposed. Rotate any keys found.
- [ ] **Remove/lock down published artifacts**: `gh-pages` currently has old full repo content. Clean it before publishing.
- [ ] **Don't commit secrets**: use `.dev.vars`/env vars only. Rotate `OBI_ADMIN_PASSWORD`, API keys, webhook secrets if exposed.
- [ ] **Restrict build output**: use `scripts/build-pages.mjs` to create `.pages-output/` (excludes backend/mobile/credentials). Never publish repo root.

## 2) Protect content from casual scraping/inspection
- [ ] **Keep content server-side**: full book is in Worker/D1, not bundled in public JS. Reader fetches section by section via authenticated/device-bound endpoints (already implemented).
- [ ] **No inline full text**: don't put manuscript in HTML/JS.
- [ ] **Rate limiting**: already have per-IP/device limits on reader/claim; keep them strict in prod.
- [ ] **Device binding**: enforce one-device per purchase/gift; block cross-device access (already implemented).
- [ ] **CORS/origin checks**: lock allowed origins to `readobiism.com` in prod; only allow dev origins via env.
- [ ] **Referrer/robots**: reader pages have `noindex,noarchive`; keep that.
- [ ] **Disable right-click/console is not security**: don't rely on JS tricks (they're bypassable). Focus on auth/rate limits/encryption.

## 3) Protect against network/console inspection
- [ ] **Use HTTPS only**: enforce HTTPS in prod; cookies should be Secure/SameSite.
- [ ] **Auth tokens in httpOnly cookies** where possible (worker already uses secure cookies for admin; reader uses device tokens + sessions).
- [ ] **Don't log sensitive data**: avoid logging tokens/emails/codes.
- [ ] **API responses**: don't leak internal errors/stack traces.
- [ ] **Consider signed URLs/tokens** for any media if added later.

## 4) PWA considerations (safe)
- [ ] **Decide if needed**: PWA can improve UX but increases attack surface if misconfigured.
- [ ] **Manifest**: only include necessary fields, same origin, correct start_url/scope.
- [ ] **Service Worker**: **do not cache protected content** (reader sections/purchases). Only cache static assets. Never cache API responses with user data.
- [ ] **Offline page**: generic offline page, no book content.
- [ ] **Update strategy**: use `skipWaiting` carefully; don't auto-serve stale protected content.
- [ ] **Add to build**: if adding PWA, include manifest/sw only in public build, ensure they don't expose routes to protected data.
- [ ] **Test**: verify SW doesn't cache `/api/reader*`, auth endpoints, etc.

## 5) Immediate actions
1. Make GitHub repo private
2. Rotate any exposed credentials
3. Audit and clean `gh-pages` branch
4. Ensure Worker is deployed with correct env vars (secrets in Cloudflare, not in repo)
5. Review CORS/origins for production
6. Add security headers (CSP, X-Content-Type-Options, Referrer-Policy) via Pages/Worker
7. Consider adding a simple abuse monitoring dashboard

## Notes
- Client-side protections (disabling console/right-click) are easily bypassed. Server-side auth, rate limiting, device binding, and not exposing content are the real protections.
- The book content is already served server-side section by section with auth/device checks - this is the main protection.
