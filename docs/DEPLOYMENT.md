# Deployment and operations handoff

Last verified: **2026-11-02**
Repository: `https://github.com/flowsiteshq/ReadObiism.com.git`
Live site: `https://readobiism.com`

This is the operational source of truth for a new session, a new machine, or another agent. Read this before deploying, publishing, or changing production data.

---

## 1. Start here (TL;DR)

```powershell
# From the repo root
git pull origin main
cd worker
npm install
npx wrangler login                 # one time per machine
npx wrangler whoami
$env:CLOUDFLARE_ACCOUNT_ID = 'ade40257c2476d8dab6d1c5ebf5e176a'
npx wrangler deployments status    # confirm access to the production Worker
npm test                           # 21 Worker tests
```

Then:

- Worker change: commit to `main` and push. Cloudflare Workers Builds deploys automatically.
- Website change: build the site, sync it to `gh-pages`, and push. GitHub Pages publishes it.
- Verify with `https://readobiism.com/api/health` and the Worker tail.

Do **not** use the stale local `gh-pages` branch, do **not** force-push `main`, and do **not** publish the repository root.

---

## 2. System map

```text
Browser
  |
  v
readobiism.com  (Cloudflare zone, account Dojoflowus)
  |
  +-- /api/*  --> Cloudflare Worker "steep-leaf-f57d" --> D1 "obi-ism-payments"
  |
  +-- /*      --> GitHub Pages (branch "gh-pages", custom domain in CNAME)
```

Two independent delivery pipelines:

| Pipeline | Trigger | Runs | Result |
| --- | --- | --- | --- |
| Worker / API | push to `main` | Cloudflare Workers Builds (`node scripts/build-pages.mjs`, then `npx wrangler deploy`) | new Worker version |
| Website | push to `gh-pages` | GitHub Pages | static site at `readobiism.com` |

A Worker change does not require a website publish. A website change usually does not require a Worker deploy, but deploy the Worker first if the site calls a new endpoint.

---

## 3. Accounts, IDs and ownership

| Resource | Value |
| --- | --- |
| Cloudflare account (production) | `Dojoflowus@gmail.com` — account ID `ade40257c2476d8dab6d1c5ebf5e176a` |
| Other visible Cloudflare account (not production) | `Nyechechris@gmail.com` — account ID `fe71b6509dfdb4312b4a841f960ce2d8` |
| Worker | `steep-leaf-f57d` |
| Worker preview URL | `https://steep-leaf-f57d.dojoflowus.workers.dev` (not the public API) |
| Public API base | `https://readobiism.com/api` |
| D1 database | `obi-ism-payments` — ID `2d960ba0-0189-478f-9ea7-0ce9efa9b7f0`, binding `OBI_DB` |
| Cloudflare zone | `readobiism.com` — zone ID `998c9079f7490cf681c6d1fc11008b4d` |
| Worker route | `readobiism.com/api/*` → `steep-leaf-f57d` |
| GitHub repository | `flowsiteshq/ReadObiism.com` |
| GitHub Pages branch | `gh-pages` (root), custom domain `readobiism.com` |
| Workers Builds production branch | `main` |

**Critical:** the production Worker and D1 exist only in the **Dojoflowus** account. The `Nyechechris` account does not contain `steep-leaf-f57d` (verified: API error `10007 This Worker does not exist on your account`). Always set `CLOUDFLARE_ACCOUNT_ID`; otherwise Wrangler refuses to guess when a login has access to multiple accounts:

```text
More than one account available but unable to select one in non-interactive mode.
```

Account IDs and zone IDs are not secrets, but do not publish customer data or credentials.

---

## 4. One-time setup on a new machine

1. Install Git, Node.js 22+ (the Worker tests use `node:sqlite`), and npm.
2. Clone the repository.
3. Install Worker dependencies:

   ```powershell
   cd worker
   npm install
   ```

4. Authenticate Wrangler (opens a browser):

   ```powershell
   npx wrangler login
   npx wrangler whoami
   ```

5. Export the production account ID for every Wrangler command:

   PowerShell:

   ```powershell
   $env:CLOUDFLARE_ACCOUNT_ID = 'ade40257c2476d8dab6d1c5ebf5e176a'
   ```

   Bash:

   ```bash
   export CLOUDFLARE_ACCOUNT_ID=ade40257c2476d8dab6d1c5ebf5e176a
   ```

6. Confirm production access:

   ```powershell
   cd worker
   npx wrangler deployments status
   ```

   Wrangler stores the OAuth session per user, not per repository. Logging in does **not** fix the Cloudflare Workers Builds token used by CI.

---

## 5. Local development and tests

From `worker/`:

```powershell
npm run dev     # local Worker on 127.0.0.1:8799, state in .wrangler/rebuild-state/
npm test        # node --test tests/*.test.mjs
```

Full local stack (from the repo root):

```powershell
.\start-local-stack.cmd
```

- Open `http://127.0.0.1:5514/`.
- Requires XAMPP MySQL and a local `worker/.dev.vars`.
- `worker/.dev.vars` is Git-ignored and is currently **absent** on this machine. `start-local-stack.cmd` will fail without it.
- Local MySQL and local D1 are separate from production. Nothing syncs automatically.
- Use test credentials only. Never reuse production secrets locally.

`admin/README.md` mentions `scripts/setup-local-admin.mjs`; that script is not present in this checkout. Create `worker/.dev.vars` manually if needed.

---

## 6. Worker: manual deploy (fallback)

Use this when Workers Builds is broken or when you need to deploy immediately:

```powershell
cd worker
$env:CLOUDFLARE_ACCOUNT_ID = 'ade40257c2476d8dab6d1c5ebf5e176a'
npx wrangler deploy
```

The output ends with a Version ID, for example:

```text
Uploaded steep-leaf-f57d
Deployed steep-leaf-f57d triggers
Current Version ID: 4506b8a2-b950-4b74-8ecf-8e3d4f71a2bf
```

Verify:

```powershell
npx wrangler deployments status
Invoke-RestMethod https://readobiism.com/api/health
```

Expected health response:

```json
{"status":"ok","service":"obi-ism-payments"}
```

There are two Wrangler configs, both targeting the same Worker and D1:

- `worker/wrangler.toml` — used when you run Wrangler from `worker/`; `main = "dashboard-worker.js"`.
- root `wrangler.toml` — used by Workers Builds; `main = "worker/dashboard-worker.js"`.

---

## 7. Worker: automatic deploy (Cloudflare Workers Builds)

Current build configuration (Cloudflare dashboard):

| Setting | Value |
| --- | --- |
| Git repository | `flowsiteshq/ReadObiism.com` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `node scripts/build-pages.mjs` |
| Deploy command | `npx wrangler deploy` |
| Build variables / secrets | currently none |

How it works:

1. Push a commit to `main`.
2. Workers Builds runs the build command, then `npx wrangler deploy`.
3. A new Worker version becomes live in roughly 30–70 seconds.

Verified on 2026-11-02:

```text
push e970366 to main at 14:07:08
automatic deployment 4506b8a2 at 14:07:44 (36 seconds, no manual command)
```

Check the result:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = 'ade40257c2476d8dab6d1c5ebf5e176a'
cd worker
npx wrangler deployments status
npx wrangler deployments list
```

Automatic deployments appear in the list authored by `dojoflowus@gmail.com`; manual deployments appear under the OAuth user who ran them.

### 7.1 Fixing a broken Workers Builds token

Symptom: builds fail at the deploy step with an authentication/token error, or the dashboard shows:

> This token may have been deleted or revoked, or it may belong to another account member. Create new token.

Fix:

1. In Cloudflare, switch to the **Dojoflowus** account (not `Nyechechris`).
2. Open **Workers & Pages → `steep-leaf-f57d` → Settings → Builds**.
3. If the warning is present, click **Create new token**.
4. Approve the Cloudflare Workers GitHub app for `flowsiteshq/ReadObiism.com` if prompted.
5. Recommended: add a build variable (not a secret):

   ```text
   CLOUDFLARE_ACCOUNT_ID = ade40257c2476d8dab6d1c5ebf5e176a
   ```

   Workers Builds normally supplies the account context, but this prevents multi-account ambiguity.
6. Save, then retry the failed build or push another commit to `main`.

Do not try to fix this by running `wrangler login` on the local machine; that only authenticates your local CLI.

### 7.2 Optional build hardening

- Pin Wrangler instead of downloading the latest on every build:

  ```text
  cd worker && npx wrangler@3.114.17 deploy
  ```

  or add Wrangler to the root `package.json` and use `npx wrangler deploy`.

- The build command `node scripts/build-pages.mjs` only prepares the static artifact. `wrangler deploy` does not upload `.pages-output`; the site is served by GitHub Pages. The build step is harmless but not required for the Worker.

- No GitHub Actions workflow exists. If Cloudflare's build token becomes unreliable, a GitHub Actions workflow using `cloudflare/wrangler-action@v3` with repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` is a viable replacement.

---

## 8. Secrets and configuration

List secret names (never prints values):

```powershell
cd worker
$env:CLOUDFLARE_ACCOUNT_ID = 'ade40257c2476d8dab6d1c5ebf5e176a'
npx wrangler secret list
```

Currently configured in production:

| Secret | Purpose |
| --- | --- |
| `OBI_ADMIN_EMAIL` | admin UI login |
| `OBI_ADMIN_PASSWORD` | admin UI password |
| `PAYSTACK_SECRET_KEY` | Paystack checkout/verification |

Optional, not currently configured (features fail closed):

| Secret | Purpose |
| --- | --- |
| `OBI_STRIPE_SECRET_KEY` | Stripe checkout |
| `OBI_STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `OBI_STRIPE_LIVE_MODE` | `1` allows live Stripe payments |
| `OBI_STRIPE_REQUIRE_LIVE` | `1` requires live Stripe mode |
| `RESEND_API_KEY` | email delivery (verification/gift) |
| `GIFT_FROM_EMAIL` | gift email sender |
| `ACCOUNT_FROM_EMAIL` | account email sender, if used |
| `BULK_CODE_ENCRYPTION_KEY` | 64 hex characters; required for bulk code recovery |
| `OBI_PUBLIC_APP_URL` | defaults to `https://readobiism.com` |
| `PAYSTACK_API_BASE` | defaults to `https://api.paystack.co` |

Set a secret:

```powershell
npx wrangler secret put BULK_CODE_ENCRYPTION_KEY
```

### 8.1 Email delivery (Resend, not cPanel SMTP)

Production does **not** send mail through cPanel SMTP. The old PHP backend used `mail()` / SMTP settings, but production API traffic runs on the Cloudflare Worker, where the supported pattern is an HTTPS email API rather than cPanel SMTP. The Worker already uses **Resend's HTTPS API** in `worker/dashboard-worker.js` for:

- Gift-code delivery (`sendGiftCodeEmail`)
- Account email verification (`POST /api/account/verify/request`)
- Device-transfer verification (`POST /api/reader/transfer/start`)

Without the secrets, these paths return `503` ("Email verification is not configured" or "Could not send...").

To enable:

1. Create a Resend account at <https://resend.com>. The free tier includes 3,000 emails/month and **100 emails/day**; paid plans such as Pro ($20/month, 50,000 emails/month) have no daily cap. Check the pricing page before relying on a limit.
2. Add the domain `readobiism.com` (or a sending subdomain such as `send.readobiism.com`).
3. Add the DNS records Resend shows to the `readobiism.com` zone in Cloudflare:
   - DKIM TXT record (`resend._domainkey...`)
   - SPF TXT record for the sending subdomain
   - MX record for bounces on the sending subdomain
   - Optional DMARC TXT record (`_dmarc`)
   Do **not** replace the existing MX records used for receiving mail.
4. Wait until Resend shows the domain as **Verified**.
5. Create an API key (`re_...`).
6. Set the Worker secrets:

   ```powershell
   cd worker
   $env:CLOUDFLARE_ACCOUNT_ID = 'ade40257c2476d8dab6d1c5ebf5e176a'
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put GIFT_FROM_EMAIL
   npx wrangler secret put ACCOUNT_FROM_EMAIL
   ```

   Use verified sender addresses, for example:

   ```text
   GIFT_FROM_EMAIL=OBI-ISM <gifts@readobiism.com>
   ACCOUNT_FROM_EMAIL=OBI-ISM <no-reply@readobiism.com>
   ```

   `ACCOUNT_FROM_EMAIL` is optional; it falls back to `GIFT_FROM_EMAIL`.

7. Test:
   - Gift: complete a gift checkout and confirm the recipient receives the code.
   - Verification: sign in, then `POST /api/account/verify/request` with the session cookie and check the inbox for the 8-digit code.
   - Watch logs during the test: `npx wrangler tail steep-leaf-f57d --format json`.

**Current status (2026-11-02):** `RESEND_API_KEY`, `GIFT_FROM_EMAIL`, and `ACCOUNT_FROM_EMAIL` are **not configured** in production, so email delivery is disabled.

**UI limitation:** the account verification UI currently lives on `bulk.html`, and bulk checkout is disabled (`503`). If email verification should be usable before bulk is enabled, add a verification panel to the account/dashboard flow; the Worker endpoints already exist.

**Alternatives:** Postmark, Mailgun, SendGrid, Brevo, MailerSend, or Amazon SES. All are HTTPS APIs; the Worker would need a small adapter because the code currently calls `api.resend.com` directly. cPanel SMTP is not a good fit for Workers. If it must be retained, the Worker would have to call a secret-protected HTTPS relay on the cPanel host, adding a moving part and a security surface.

**Notes:**

- Verify SPF, DKIM, and DMARC to avoid spam filtering. Use a sending subdomain if the root domain already has mailboxes.
- Do not commit the API key.
- Password reset is **not implemented**; only gift delivery and email verification use email today.

Rules:

- Never commit `.dev.vars`, `.env`, API keys, database files, or private keys.
- Never reuse local/admin credentials in production.
- Rotate `OBI_ADMIN_PASSWORD` and any exposed provider key immediately if leaked.
- Bulk orders are not fully configured in production. See `docs/BULK-ORDERS.md` and `docs/BULK-CODE-RECOVERY.md`.

---

## 9. D1 operations

Run read-only queries freely; be careful with writes.

```powershell
cd worker
$env:CLOUDFLARE_ACCOUNT_ID = 'ade40257c2476d8dab6d1c5ebf5e176a'

# Inspect schema
npx wrangler d1 execute obi-ism-payments --remote --command "PRAGMA table_info(obi_accounts)"

# Count accounts
npx wrangler d1 execute obi-ism-payments --remote --command "SELECT count(*) AS n FROM obi_accounts"

# List databases
npx wrangler d1 list
```

### 9.1 Clear registration rate limits

Registration is limited to **6 requests/hour per IP** and **3/hour per email**. Login is limited to 25/15 min per IP and 10/15 min per account. A 429 response includes `retryAfter` seconds.

After diagnostic probes, clear only the registration buckets:

```powershell
npx wrangler d1 execute obi-ism-payments --remote --command "DELETE FROM request_limits WHERE bucket LIKE 'register-ip:%' OR bucket LIKE 'register-email:%'"
```

### 9.2 Delete a test account

Use a unique `@example.com` address for tests, then remove both the session and the account:

```powershell
npx wrangler d1 execute obi-ism-payments --remote --command "DELETE FROM obi_account_sessions WHERE account_id=(SELECT id FROM obi_accounts WHERE email='test@example.com')"
npx wrangler d1 execute obi-ism-payments --remote --command "DELETE FROM obi_accounts WHERE email='test@example.com'"
```

Never delete the real account `chrismpamugo99@gmail.com` without owner approval.

---

## 10. Website: GitHub Pages publishing

The published site is the `gh-pages` branch. It contains only the website files (currently 1,764 files), plus:

- `CNAME` → `readobiism.com`
- `.nojekyll`
- `_headers` (preserved, but see the caveat below)

Build the publishable artifact from the repo root:

```powershell
node scripts/build-pages.mjs
```

This creates `.pages-output/` (Git-ignored). The script copies root HTML and selected assets, plus `assets/`, `admin/`, `auth/`, `dashboard/`, and excludes dotfiles, maps, PHP, SQL, databases, keys, logs, and backups. As of this change it also includes `CNAME` and `.nojekyll`, so the artifact can be published without losing the custom domain.

Current sync state: the built artifact matches `origin/gh-pages` file-for-file.

### 10.1 Worker-only change (site unchanged)

No content publish is required. The project convention is to push an empty "Republish website..." commit to trigger a GitHub Pages rebuild:

```powershell
git fetch origin gh-pages
$parent = git rev-parse origin/gh-pages
$tree = git rev-parse "$parent^{tree}"
$commit = ("Republish website after <change>" | git commit-tree $tree -p $parent)
git push origin "${commit}:refs/heads/gh-pages"
```

This is non-destructive and does not use the stale local `gh-pages` branch.

### 10.2 Site change (real publish)

Use a fresh worktree based on `origin/gh-pages`; never publish the repository root.

```powershell
# From the repo root, with main checked out
node scripts/build-pages.mjs
git fetch origin gh-pages
git worktree add --detach ..\readobi-app-gh-pages origin/gh-pages

# Replace the worktree contents, preserving .git
Get-ChildItem ..\readobi-app-gh-pages -Force |
  Where-Object { $_.Name -ne '.git' } |
  Remove-Item -Recurse -Force
Get-ChildItem .pages-output -Force |
  Copy-Item -Destination ..\readobi-app-gh-pages -Recurse -Force

git -C ..\readobi-app-gh-pages add -A
git -C ..\readobi-app-gh-pages commit -m "Publish website from main"
git -C ..\readobi-app-gh-pages push origin HEAD:gh-pages
git worktree remove ..\readobi-app-gh-pages
```

Verify after GitHub Pages finishes (usually under a minute):

```powershell
Invoke-WebRequest https://readobiism.com/ -UseBasicParsing | Select-Object StatusCode
Invoke-RestMethod https://readobiism.com/api/health
```

### 10.3 Publishing rules

- Publish the Worker first, then the site (`docs/PUBLISHING.md` ordering rule).
- Never publish the repository root. Backend PHP, SQL, mobile, manuscript, `.local-backup`, and credentials must not be public.
- The local `gh-pages` branch (`ff41b22`) and the worktree at `C:\Users\FAVOUR\Documents\read_obi_ebook\readobiism-site` are stale and diverged. Do not commit or push from them. Base all work on `origin/gh-pages`.
- Do not force-push `main` or `gh-pages`; use normal commits.
- `_headers` is a Cloudflare Pages convention. GitHub Pages does not apply it; it is kept for compatibility. If those security headers are required, configure them with Cloudflare Transform Rules or in the Worker.

---

## 11. Verification and smoke tests

```powershell
# API health
Invoke-RestMethod https://readobiism.com/api/health

# Current Worker version
cd worker
$env:CLOUDFLARE_ACCOUNT_ID = 'ade40257c2476d8dab6d1c5ebf5e176a'
npx wrangler deployments status

# Live logs (Ctrl+C to stop)
npx wrangler tail steep-leaf-f57d --format json
```

Registration smoke test (use a unique address, then clean up):

```powershell
$email = "deploy.check.$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.com"
$body = @{ email = $email; password = 'diagnostic-password-123' } | ConvertTo-Json
Invoke-RestMethod -Uri https://readobiism.com/api/account/register `
  -Method Post -ContentType 'application/json' `
  -Headers @{ Origin = 'https://readobiism.com' } -Body $body
```

Expected: `200` with `account.email` set. Then delete the test rows using the D1 commands in section 9.2.

A 429 means the rate limit is active; wait or clear the registration buckets.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `More than one account available...` | Wrangler cannot choose between two accounts | Set `CLOUDFLARE_ACCOUNT_ID=ade40257...` |
| `This Worker does not exist on your account` | Wrong Cloudflare account selected | Use the Dojoflowus account |
| Registration returns 500 "The edition service hit an unexpected error." | Worker exception; check tail | `npx wrangler tail ...`; see incident history |
| `NotSupportedError: Pbkdf2 failed: iteration counts above 100000...` | PBKDF2 constant too high | Keep `PBKDF2_ITERATIONS` at 100000 or lower |
| 429 "Too many requests" | Rate limit | Wait `retryAfter` seconds or clear `request_limits` buckets |
| `wrangler whoami` says not authenticated | No local OAuth session | `npx wrangler login` |
| Workers Builds fails at deploy with auth/token error | Revoked build token | Recreate the token in Workers Builds settings |
| Push to `main` does not deploy | Build failed or token broken | Check Workers Builds logs; use manual deploy as fallback |
| Site shows old content | `gh-pages` not updated, or Pages build pending | Publish `gh-pages`; check GitHub Pages status |
| `start-local-stack.cmd` exits immediately | Missing `worker/.dev.vars` or MySQL not running | Create `.dev.vars`; start XAMPP MySQL |
| `.pages-output` missing `CNAME`/`.nojekyll` | Old build script | Current script copies both; do not delete them |

---

## 13. Incident history and known issues (2026-11-02)

### 13.1 Registration 500 — PBKDF2 limit

- Symptom: registration returned `500 {"error":"The edition service hit an unexpected error. Please try again."}`.
- Root cause: `passwordDigest` requested **120,000** PBKDF2 iterations. Cloudflare Workers rejects anything above **100,000**:

  ```text
  NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 120000).
  ```

- Fix: `PBKDF2_ITERATIONS = 100000` in `worker/dashboard-worker.js`, plus a source-level regression test. Commit `74a4aeb`.
- Registration and login were verified live (200) after the fix.

### 13.2 Legacy `obi_accounts` schema

- The old baseline `0001_local_schema_baseline.sql` omits `email_verified`.
- `CREATE TABLE IF NOT EXISTS` cannot add columns, so the Worker now self-heals once per isolate:
  `PRAGMA table_info(obi_accounts)` followed by `ALTER TABLE ... ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`.
- Registration also omits `email_verified` from the INSERT so it does not depend on the repair. Commit `60c0697`.

### 13.3 Legacy production account

- Account: `chrismpamugo99@gmail.com`, created 2026-10-16, never signed in.
- Its password hash was created with the old 120,000-iteration setting and cannot be verified at the 100,000 limit.
- Options: delete it so the owner can register again, or replace its password hash in D1 with a freshly generated 100,000-iteration hash.
- **Decision pending. Do not delete it without owner approval.**

### 13.4 Workers Builds token

- The old build token (`60b8ff3b-2b26-4bd9-986d-008d02761559`) was revoked or belonged to another account member.
- As of 2026-11-02, automatic deploy is working; a push to `main` produced version `4506b8a2` in 36 seconds.
- If the warning returns, recreate the token (section 7.1).

### 13.5 Documentation that is stale

- `docs/PUBLISHING.md` previously described Cloudflare Pages. There is **no Cloudflare Pages project**. The site is GitHub Pages. The file has been updated to point here.
- `README.md` previously warned not to push the Worker rearrangement to `main`. That is outdated; production now uses the root `wrangler.toml` and Workers Builds.
- `admin/README.md` references `scripts/setup-local-admin.mjs`, which is not in this checkout.
- `SECURITY-HARDENING.md` says `gh-pages` contains full repository content. The current `gh-pages` branch contains only the 1,764 site files, but re-audit before publishing.
- Root `package.json` is an unrelated frontend boilerplate (`alg-frontend-boilerplate`). Do not use its `dev`/`build` scripts for the Worker.

---

## 14. Safety rules

1. Never commit secrets or publish the repository root.
2. Never force-push `main` or `gh-pages`.
3. Use a unique test email for production smoke tests and delete the test rows afterward.
4. Clear registration rate-limit buckets after diagnostic probes so the owner can test.
5. Do not modify or delete the real account without owner approval.
6. Deploy the Worker before publishing site changes that call new endpoints.
7. After any production change, report the commit hash and Worker Version ID.

---

## 15. Command cheat sheet

| Task | Command |
| --- | --- |
| Set production account | `$env:CLOUDFLARE_ACCOUNT_ID='ade40257c2476d8dab6d1c5ebf5e176a'` |
| Check login | `npx wrangler whoami` |
| Current version | `npx wrangler deployments status` |
| Deployment history | `npx wrangler deployments list` |
| Manual deploy | `cd worker; npx wrangler deploy` |
| Live logs | `npx wrangler tail steep-leaf-f57d --format json` |
| List secrets | `npx wrangler secret list` |
| Set secret | `npx wrangler secret put NAME` |
| D1 query | `npx wrangler d1 execute obi-ism-payments --remote --command "SELECT ..."` |
| List D1 databases | `npx wrangler d1 list` |
| Worker tests | `cd worker; npm test` |
| Build static artifact | `node scripts/build-pages.mjs` |
| Republish `gh-pages` trigger | `git commit-tree` empty commit (section 10.1) |
| Publish site content | Worktree sync (section 10.2) |
| Health check | `Invoke-RestMethod https://readobiism.com/api/health` |

---

## 16. New-session checklist

1. Read this file and `docs/PUBLISHING.md`.
2. `git status` is clean; `git pull origin main`.
3. Set `CLOUDFLARE_ACCOUNT_ID` to the Dojoflowus account.
4. `npx wrangler whoami` and `npx wrangler deployments status`.
5. `cd worker; npm test` (expect 21 passing tests).
6. Make the change; test locally.
7. Commit and push `main`; confirm Workers Builds produced a new version.
8. Verify `/api/health` and, for auth changes, a registration/login smoke test.
9. If site files changed, build and publish `gh-pages`; verify `readobiism.com`.
10. Clean up test accounts and rate-limit buckets.
11. Report the commit hash, Worker Version ID, and any pending decisions.
