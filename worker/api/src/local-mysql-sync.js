// Isolated local development only. Never accepts writes to deployed Workers.
import { same } from './security.js';

const json = (body, status) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function applyLocalMysqlAccount(request, env, ensure) {
  const url = new URL(request.url);
  if (env.OBI_MYSQL_LOCAL_SYNC !== '1' || url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = env.OBI_MYSQL_LOCAL_SYNC_SECRET;
  const supplied = request.headers.get('x-obi-local-sync-secret') || '';
  if (!/^[a-f0-9]{64}$/.test(secret || '') || !same(secret, supplied)) return json({ error: 'Not authorized.' }, 401);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Invalid request.' }, 415);
  const raw = await request.text();
  if (raw.length > 4096) return json({ error: 'Invalid request.' }, 413);
  let item;
  try { item = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
  const { id, email, password_hash: hash, password_salt: salt, created_at: created } = item || {};
  if (!/^acct_m_[a-f0-9]{32}$/.test(id || '') || typeof email !== 'string' || email !== email.trim().toLowerCase() || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)
    || !/^[A-Za-z0-9+/]{43}=$/.test(hash || '') || !/^[A-Za-z0-9+/]{22}==$/.test(salt || '')
    || typeof created !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(created) || Number.isNaN(Date.parse(created))) {
    return json({ error: 'Invalid account sync record.' }, 400);
  }
  await ensure(env);
  await env.OBI_DB.prepare('INSERT OR IGNORE INTO obi_accounts (id,email,password_hash,password_salt,created_at,last_signed_in) VALUES (?,?,?,?,?,?)')
    .bind(id, email, hash, salt, created, created).run();
  const row = await env.OBI_DB.prepare('SELECT id,email,password_hash,password_salt FROM obi_accounts WHERE id=?').bind(id).first();
  if (!row || row.email !== email || !same(row.password_hash, hash) || !same(row.password_salt, salt)) return json({ error: 'Account conflicts with an existing local D1 record.' }, 409);
  return json({ synced: true }, 200);
}
