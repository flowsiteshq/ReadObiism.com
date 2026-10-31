# D1 migrations: initial baseline

`migrations/0001_local_schema_baseline.sql` is a review-only snapshot generated from the current rebuild Worker source. It contains table and index definitions, not customer records, secrets or manuscript paragraphs. It has **not** been compared with the actual production D1 schema and must not be blindly applied to an existing database.

The Worker still runs its existing `CREATE TABLE IF NOT EXISTS` schema at runtime. During this transitional stage the automated schema parity test ensures a blank local database created from the baseline has the same structure as one created by the Worker schema. This is not yet a complete migration system.

Before using versioned migrations against a real environment: inspect and compare the existing schema and migration history; agree how existing databases will be baselined without silently marking unapplied changes as complete; test upgrade and backup/restore on isolated D1; and configure separate local, staging and production bindings. Future changes need incremental reviewed migrations rather than editing this baseline after it has been adopted.

Never sync local test purchases or accounts into production, and do not import production records into local development without a reviewed privacy and sanitization process.

## Isolated smoke-test fixture

`fixtures/local-smoke-test.sql` contains a synthetic purchase and sample paragraph for the local integration check. It must only be used with the isolated `--local --persist-to .wrangler/rebuild-state` database after the synthetic test account and schema exist. It is not the manuscript and must never be applied to production. The rebuild has been checked through the local proxy for account login, licence claim and section retrieval with this fixture. This does not validate the payment gateways, real email, mobile devices, live D1 or browser visual parity.

## Viewing local D1 in phpMyAdmin

Start XAMPP's Apache and MySQL services, open phpMyAdmin, reload its navigation panel, and expand **obi_d1_local_mirror**. This dedicated MariaDB database displays the rebuild's isolated local D1 tables and local test records. The `__obi_mirror_status` table shows the last successful refresh.

To start the automatic mirror again, run this from the `obiism-rebuild` directory (Node.js with `node:sqlite` support is required):

```powershell
pnpm.cmd dev:db-mirror
```

Leave the command running: it refreshes the mirror every five seconds. Refresh phpMyAdmin to see changes. Press Ctrl+C to stop it. For a single refresh, use `pnpm.cmd db:mirror:once`. The default connection is local MariaDB as `root` with a blank password; if your local setup differs, provide `OBI_MIRROR_MYSQL_USER` and `OBI_MIRROR_MYSQL_PASSWORD` as environment variables.

This is a **one-way inspection copy** of `.wrangler/rebuild-state`, not the live Cloudflare database or the application's database. Every refresh replaces the copied rows; changes made in phpMyAdmin are overwritten and do not affect D1. New tables and columns can be added automatically; incompatible changes or removals stop the mirror for review. SQLite and MariaDB have different types and features, so indexes, constraints and SQL behavior are not necessarily identical. Keep phpMyAdmin local and do not use this mirror for production data; copied test rows may include account or token hashes.

The local baseline has not yet been checked against live D1, and the mirror does not fetch or synchronize live data. Comparing the production schema or copying production records requires a separate authorized review and, for records, a privacy and sanitization process.
