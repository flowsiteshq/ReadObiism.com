// Reader feedback is private to the OBI-ISM team. One row per purchase/device.
const ensured = new WeakSet();

export async function ensureFeedbackSchema(env) {
  if (!env?.OBI_DB || ensured.has(env.OBI_DB)) return;
  await env.OBI_DB.prepare(`CREATE TABLE IF NOT EXISTS book_feedback (
    id TEXT PRIMARY KEY,
    checkout_session_id TEXT NOT NULL,
    device_hash TEXT NOT NULL,
    purchaser_email TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(checkout_session_id, device_hash)
  )`).bind().run();
  await env.OBI_DB.prepare('CREATE INDEX IF NOT EXISTS book_feedback_created_idx ON book_feedback(created_at)').bind().run();
  await env.OBI_DB.prepare('CREATE INDEX IF NOT EXISTS book_feedback_session_idx ON book_feedback(checkout_session_id)').bind().run();
  ensured.add(env.OBI_DB);
}
