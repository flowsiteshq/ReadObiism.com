// D1-backed edition pricing and access duration. The values in pricing.js remain
// the compiled defaults and the fallback for databases created before this
// feature shipped.
import { EDITION_SKU, NGN_PRICE_KOBO, USD_PRICE_CENTS } from './pricing.js';

const NGN_KEY = 'price_ngn_minor';
const USD_KEY = 'price_usd_minor';
const ACCESS_KEY = 'access_duration_days';
export const DEFAULT_ACCESS_DAYS = 365;
export const MAX_ACCESS_DAYS = 3650;
const ensured = new WeakSet();

function formatMoney(minor, currency) {
  const digits = currency === 'USD' ? 2 : 0;
  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 100);
  return `${currency === 'USD' ? '$' : '₦'}${text}`;
}

function price(currency, minor) {
  return {
    currency,
    amount: minor / 100,
    minor,
    formatted: formatMoney(minor, currency),
  };
}

export function defaultPricing() {
  return {
    NGN: price('NGN', NGN_PRICE_KOBO),
    USD: price('USD', USD_PRICE_CENTS),
    sku: EDITION_SKU,
    accessDays: DEFAULT_ACCESS_DAYS,
  };
}

export async function ensurePricing(env) {
  if (!env?.OBI_DB || ensured.has(env.OBI_DB)) return;
  await env.OBI_DB.prepare(
    'CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)',
  ).bind().run();
  ensured.add(env.OBI_DB);
}

function validMinor(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export function validAccessDays(value, fallback = DEFAULT_ACCESS_DAYS) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= MAX_ACCESS_DAYS
    ? number
    : fallback;
}

/** Access window in days. Used when a purchase is granted. */
export async function getAccessDays(env) {
  if (!env?.OBI_DB) return DEFAULT_ACCESS_DAYS;
  await ensurePricing(env);
  const row = await env.OBI_DB.prepare('SELECT value FROM site_settings WHERE key=?')
    .bind(ACCESS_KEY)
    .first()
    .catch(() => null);
  return validAccessDays(row?.value, DEFAULT_ACCESS_DAYS);
}

/** ISO timestamp `days` after `from` (defaults to now). */
export function accessExpiry(days, from = new Date()) {
  return new Date(from.getTime() + validAccessDays(days) * 86400000).toISOString();
}

export async function getPricing(env) {
  if (!env?.OBI_DB) return defaultPricing();
  await ensurePricing(env);
  const result = await env.OBI_DB.prepare(
    'SELECT key,value FROM site_settings WHERE key IN (?,?,?)',
  ).bind(NGN_KEY, USD_KEY, ACCESS_KEY).all();
  const values = new Map((result.results || []).map((row) => [row.key, row.value]));
  const defaults = defaultPricing();
  return {
    NGN: price('NGN', validMinor(values.get(NGN_KEY), defaults.NGN.minor)),
    USD: price('USD', validMinor(values.get(USD_KEY), defaults.USD.minor)),
    sku: EDITION_SKU,
    accessDays: validAccessDays(values.get(ACCESS_KEY), DEFAULT_ACCESS_DAYS),
  };
}

export function validatePricing(body) {
  const ngn = Number(body?.ngn);
  const usd = Number(body?.usd);
  if (!Number.isInteger(ngn) || ngn < 1 || ngn > 1000000) {
    return { ok: false, error: 'Enter a whole Naira price between ₦1 and ₦1,000,000.' };
  }
  const usdMinor = Math.round(usd * 100);
  if (!Number.isFinite(usd) || usd < 0.01 || usd > 10000 || Math.abs(usd * 100 - usdMinor) > 1e-6) {
    return { ok: false, error: 'Enter a Dollar price between $0.01 and $10,000 with at most two decimals.' };
  }
  const hasAccessDays = body?.accessDays !== undefined && body?.accessDays !== null && body?.accessDays !== '';
  const accessDays = hasAccessDays ? Number(body.accessDays) : DEFAULT_ACCESS_DAYS;
  if (!Number.isInteger(accessDays) || accessDays < 1 || accessDays > MAX_ACCESS_DAYS) {
    return { ok: false, error: `Enter a whole access duration between 1 and ${MAX_ACCESS_DAYS} days.` };
  }
  return { ok: true, ngnMinor: ngn * 100, usdMinor, accessDays, hasAccessDays };
}

export async function savePricing(env, parsed, updatedBy = '') {
  await ensurePricing(env);
  const now = new Date().toISOString();
  const upsert = 'INSERT INTO site_settings (key,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by';
  const statements = [
    env.OBI_DB.prepare(upsert).bind(NGN_KEY, String(parsed.ngnMinor), now, updatedBy),
    env.OBI_DB.prepare(upsert).bind(USD_KEY, String(parsed.usdMinor), now, updatedBy),
  ];
  if (parsed.hasAccessDays !== false && Number.isInteger(parsed.accessDays)) {
    statements.push(
      env.OBI_DB.prepare(upsert).bind(ACCESS_KEY, String(parsed.accessDays), now, updatedBy),
    );
  }
  await env.OBI_DB.batch(statements);
  return getPricing(env);
}
