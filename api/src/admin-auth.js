// Separate administrator sessions. Never accept reader tokens as admin credentials.
import { hashDeviceToken, same } from './security.js';
import { adminData } from './admin-data.js';

const cookieName = 'obi_admin_session';
const ttlSeconds = 4 * 60 * 60;
const schema = `CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, admin_email TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_login_limits (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);`;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const cookie = (token, maxAge) => `${cookieName}=${token}; Max-Age=${maxAge}; Path=/api/admin; Secure; HttpOnly; SameSite=Strict`;
const tokenFrom = (request) => {
  const match = (request.headers.get('cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`));
  const value = match ? match.slice(cookieName.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
};
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('');
const sameOrigin = (request) => request.headers.get('origin') === new URL(request.url).origin;
const configured = (env) => typeof env.OBI_ADMIN_EMAIL === 'string' && /^\S+@\S+\.\S+$/.test(env.OBI_ADMIN_EMAIL) && typeof env.OBI_ADMIN_PASSWORD === 'string' && env.OBI_ADMIN_PASSWORD.length >= 24;

async function session(request, env) {
  const token = tokenFrom(request);
  if (!token || !configured(env)) return null;
  const row = await env.OBI_DB.prepare('SELECT admin_email FROM admin_sessions WHERE token_hash=? AND expires_at>?').bind(await hashDeviceToken(token), new Date().toISOString()).first();
  return row && same(await hashDeviceToken(row.admin_email), await hashDeviceToken(env.OBI_ADMIN_EMAIL.trim().toLowerCase())) ? row : null;
}

export async function handleAdminAuth(request, env) {
  const path = new URL(request.url).pathname;
  if (!env.OBI_DB || !configured(env)) return json({ error: 'Administrator sign-in is not configured.' }, 503);
  if (!['/api/admin/login', '/api/admin/session', '/api/admin/logout'].includes(path)) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    await env.OBI_DB.exec(schema);
    if (!await session(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
    return adminData(request, env);
  }
  if ((path === '/api/admin/login' || path === '/api/admin/logout') && (request.method !== 'POST' || !sameOrigin(request))) return json({ error: 'Request not allowed.' }, 403);
  if (path === '/api/admin/session' && request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  await env.OBI_DB.exec(schema);
  if (path === '/api/admin/session') {
    const admin = await session(request, env);
    return admin ? json({ authenticated: true, email: admin.admin_email }) : json({ authenticated: false }, 401);
  }
  if (path === '/api/admin/logout') {
    const token = tokenFrom(request);
    if (token) await env.OBI_DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await hashDeviceToken(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
  }
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Request not allowed.' }, 415);
  // Fail closed if D1 rate limiting fails; unlike reader access this is privileged.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Math.floor(Date.now() / 1000), windowStart = now - (now % 900);
  const bucket = await hashDeviceToken(ip);
  const limit = await env.OBI_DB.prepare('INSERT INTO admin_login_limits (bucket,window_start,count) VALUES (?,?,1) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN window_start=excluded.window_start THEN count+1 ELSE 1 END,window_start=excluded.window_start RETURNING count').bind(bucket, windowStart).first();
  if (!limit || limit.count > 10) return json({ error: 'Too many attempts. Please try again later.' }, 429);
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  const password = typeof body.password === 'string' && body.password.length <= 256 ? body.password : '';
  const emailMatches = same(await hashDeviceToken(email), await hashDeviceToken(env.OBI_ADMIN_EMAIL.trim().toLowerCase()));
  const passwordMatches = same(await hashDeviceToken(password), await hashDeviceToken(env.OBI_ADMIN_PASSWORD));
  if (!emailMatches || !passwordMatches) return json({ error: 'Email or password is incorrect.' }, 401);
  const token = randomToken();
  const created = new Date();
  await env.OBI_DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(created.toISOString()).run();
  await env.OBI_DB.prepare('INSERT INTO admin_sessions (token_hash,admin_email,created_at,expires_at) VALUES (?,?,?,?)').bind(await hashDeviceToken(token), env.OBI_ADMIN_EMAIL.trim().toLowerCase(), created.toISOString(), new Date(created.getTime() + ttlSeconds * 1000).toISOString()).run();
  return json({ authenticated: true }, 200, { 'set-cookie': cookie(token, ttlSeconds) });
}
