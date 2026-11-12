// Server-side feature switches. These are enforced by the Worker; the public
// endpoint only tells the browser which controls to show.
export const FEATURE_DEFINITIONS = [
  { key: 'paystack_processing_charge', label: 'Paystack processing charge', description: 'Add the Paystack processing charge to single, gift and bulk NGN checkouts.' },
  { key: 'single_purchase', label: 'Single edition purchase', description: 'Allow new single-edition checkout sessions.' },
  { key: 'gift_purchase', label: 'Gift purchases', description: 'Allow buying an edition as a gift.' },
  { key: 'bulk_purchase', label: 'Bulk / group purchase', description: 'Allow new bulk orders and shared-code checkout.' },
  { key: 'annual_subscription', label: 'Annual subscription', description: 'Allow annual subscription and renewal access for readers.' },
  { key: 'device_transfer', label: 'Transfer edition', description: 'Allow readers to move an edition to a new device.' },
  { key: 'google_signin', label: 'Google sign-in', description: 'Show and accept Google account sign-in.' },
  { key: 'phone_signin', label: 'Phone sign-up / sign-in', description: 'Allow phone number and password accounts.' },
  { key: 'reader_feedback', label: 'Reader feedback', description: 'Allow active readers to submit ratings and comments.' },
];

const DEFAULTS = Object.fromEntries(FEATURE_DEFINITIONS.map((feature) => [feature.key, true]));
// Device transfers are off by default. Annual subscriptions are also off by
// default: the edition is sold as a one-time purchase. Either can be re-enabled
// from the admin feature panel without a deploy.
DEFAULTS.device_transfer = false;
DEFAULTS.annual_subscription = false;

const ensured = new WeakSet();

function normalizedKey(key) {
  return FEATURE_DEFINITIONS.some((feature) => feature.key === key) ? key : '';
}

export async function ensureFeatureFlags(env) {
  if (!env?.OBI_DB || ensured.has(env.OBI_DB)) return;
  await env.OBI_DB.prepare(
    'CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)',
  ).bind().run();
  ensured.add(env.OBI_DB);
}

export async function getFeatureFlags(env) {
  if (!env?.OBI_DB) return { ...DEFAULTS };
  await ensureFeatureFlags(env);
  const rows = await env.OBI_DB.prepare('SELECT key,enabled FROM feature_flags').bind().all();
  const flags = { ...DEFAULTS };
  for (const row of rows.results || []) {
    if (normalizedKey(row.key)) flags[row.key] = Number(row.enabled) === 1;
  }
  return flags;
}

export async function isFeatureEnabled(env, key) {
  const flags = await getFeatureFlags(env);
  return Boolean(flags[key]);
}

export async function getAdminFeatureFlags(env) {
  const flags = await getFeatureFlags(env);
  return FEATURE_DEFINITIONS.map((feature) => ({
    ...feature,
    enabled: Boolean(flags[feature.key]),
  }));
}

export async function setFeatureFlag(env, key, enabled, actor = '') {
  const cleanKey = normalizedKey(key);
  if (!cleanKey) return { status: 400, body: { error: 'Unknown feature.' } };
  await ensureFeatureFlags(env);
  const now = new Date().toISOString();
  await env.OBI_DB.prepare(
    'INSERT INTO feature_flags (key,enabled,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by',
  ).bind(cleanKey, enabled ? 1 : 0, now, actor || null).run();
  return {
    status: 200,
    body: { feature: cleanKey, enabled: Boolean(enabled), updated_at: now },
  };
}
