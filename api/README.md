# OBI-ISM API: staged modularization

The Cloudflare entry point remains `../dashboard-worker.js` and the existing `../wrangler.toml` is unchanged. This preserves the current deployment path while functionality is extracted into `src/` in small, tested steps. Do not deploy this branch to production until the release gate, environment configuration, migration plan, and compatibility checks in the architecture plan have been completed.

`src/validation.js` and `src/security.js` are the first extracted modules. The Worker continues to export the existing validation and hashing functions and API contracts, so current tests and clients use the same formats. Additional modules should be extracted only with behavioral tests for existing routes and providers. A Wrangler dry run must be repeated whenever modules are moved; it does not deploy the Worker.

Secrets stay in Cloudflare or local environment configuration, not this directory. Local D1, test payment credentials, and production D1 remain separate. The transfer implementation and its remaining prerequisites are documented in `../DEVICE-TRANSFER-ROLL-OUT.md`.
