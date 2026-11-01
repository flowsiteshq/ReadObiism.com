# Local OBI PHP bridge

The local web proxy, PHP bridge and Worker are now in the same workspace. Start XAMPP MySQL, then run `start-local-stack.cmd` at the workspace root. The proxy listens on 5514, the PHP CLI bridge on 8899, and the Worker on 8799. The PHP bridge is local-only and is not a production API.

Reader account registration writes to local MySQL first and syncs to local D1; pending records are retried by the local background watcher. Payments, gifts, devices and reading use the local Worker and D1. No local records are synced to live D1. The optional `obi_d1_local_mirror` is a one-way inspection copy, not a data source for the app.

To install Worker dependencies, run `npm install` from `worker/`. To run the local D1 inspection mirror, run `npm run mirror` from `worker/`. Logs and local database state are under `worker/.wrangler/` and must never be published. The mobile application is configured separately.

The flexible local proxy accepts HTTP origins on `127.0.0.1` on different ports to support Five Server. This trusts other local HTTP services on those ports and is intended only for development. Use `http://127.0.0.1:5514/` to test checkout and device-bound reader behavior.
