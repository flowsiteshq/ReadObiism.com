# Frozen extraction sources

These five pages are the source snapshot used by the one-time web migration. They
were captured from the `readobiism-site` worktree on 2026-10-31, when it stood on
`gh-pages` at `ff41b22` with the reviewed site edits in the working tree.

`scripts/verify-landing-parity.mjs`, `scripts/verify-reader-auth-parity.mjs` and
`scripts/verify-gift-api-parity.mjs` compare these files with `web/` to prove that
the migration only extracted CSS and JavaScript and switched the pages to the
shared `assets/js/obi-api.js` client.

They are historical fixtures, not pages to edit or publish. Do not update them to
match later `web/` changes; if a page is intentionally redesigned, replace the
corresponding check with a test for the new behavior.
