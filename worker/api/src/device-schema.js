// Adds device-audit columns to databases created before transfer hardening.
const repaired = new WeakSet();

export async function ensureDeviceSchema(env) {
  if (!env?.OBI_DB || repaired.has(env.OBI_DB)) return;
  await env.OBI_DB.exec("CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL, metadata_json TEXT)");
  await env.OBI_DB.exec("CREATE TABLE IF NOT EXISTS device_transfer_audit (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, old_device_hash TEXT, new_device_hash TEXT, metadata_json TEXT, created_at TEXT NOT NULL)");
  const addColumn = async (table, column, definition) => {
    const info = await env.OBI_DB.prepare(`PRAGMA table_info(${table})`).bind().all();
    const names = new Set((info.results || []).map((item) => item.name));
    if (names.has(column)) return;
    try {
      await env.OBI_DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).bind().run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error))) throw error;
    }
  };
  await addColumn("reader_devices", "metadata_json", "TEXT");
  await addColumn("device_transfer_audit", "old_device_hash", "TEXT");
  await addColumn("device_transfer_audit", "new_device_hash", "TEXT");
  await addColumn("device_transfer_audit", "metadata_json", "TEXT");
  repaired.add(env.OBI_DB);
}
