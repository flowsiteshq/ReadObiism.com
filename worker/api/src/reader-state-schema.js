// Per-reader bookmarks, notes and reading progress. One row per section/device.
const ensured = new WeakSet();

export async function ensureReaderStateSchema(env) {
  if (!env?.OBI_DB || ensured.has(env.OBI_DB)) return;
  await env.OBI_DB.prepare(`CREATE TABLE IF NOT EXISTS reader_state (
    checkout_session_id TEXT NOT NULL,
    device_hash TEXT NOT NULL,
    section_id TEXT NOT NULL,
    bookmark INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    progress REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (checkout_session_id, device_hash, section_id)
  )`).bind().run();
  await env.OBI_DB.prepare('CREATE INDEX IF NOT EXISTS reader_state_updated_idx ON reader_state(checkout_session_id, device_hash, updated_at)').bind().run();
  ensured.add(env.OBI_DB);
}
