# Publishing the web app

The public site keeps its current GitHub Pages setup: the `gh-pages` branch is
published at `readobiism.com`. No Pages setting has to change.

`main` is the only branch edited by hand. `web/` is the source of the public
site. `.github/workflows/publish-web.yml` mirrors `web/` into `gh-pages` after
every push to `main` that touches `web/`, so the domain keeps reading the same
branch it reads today.

## What the mirror does

- Copies everything in `web/` to the root of `gh-pages`.
- Deletes files that no longer exist in `web/`.
- Keeps `gh-pages/.git` and the branch history; each publish is one commit.
- Skips `web/README.md` and `web/admin/`. The admin shell stays out of the
  public site until its API and access control are approved for production.
- Keeps `web/CNAME` (`readobiism.com`) and `web/.nojekyll` in the published
  output.

## First run

`gh-pages` currently holds an old copy of the whole repository: the Expo
source, `server/`, `manuscript/obi-ism-manuscript.txt` and other files that
were never meant to be public. They are downloadable from `readobiism.com`
today; for example `/manuscript/obi-ism-manuscript.txt` returns 200.

The first mirror run deletes them, because `--delete` makes `gh-pages` match
`web/` exactly. After the run, confirm those URLs return 404.

## Ordering rule

Publish the site only after the Worker that the site calls is deployed. The
current `web/` gift and device-transfer pages call endpoints that production
does not have yet. Pushing `main` before the Worker is deployed would publish
those pages against 404s.

Recommended order:

1. Deploy the compatible Worker (including the gift and transfer endpoints).
2. Verify `/api/health` and the new endpoints.
3. Push `main`; the workflow publishes `web/` to `gh-pages`.
4. Verify `readobiism.com/redeem.html`, `/gift-confirmation.html` and the reader.

## Manual run

The workflow also has `workflow_dispatch`, so it can be re-run from the Actions
tab after a transient failure. That is a run control, not a settings change.

## Rollback

Revert the commit on `gh-pages` and push it. Pages redeploys the previous
artifact. Do not force-push `main`.
