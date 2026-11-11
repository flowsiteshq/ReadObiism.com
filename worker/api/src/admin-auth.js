// Separate administrator sessions. Never accept reader tokens as admin credentials.
import { hashDeviceToken, same } from './security.js';
import { adminData } from './admin-data.js';
import { getPricing, savePricing, validatePricing } from './pricing-store.js';
import { setBulkOrderClaimsState } from './bulk-orders.js';
import { getAdminFeatureFlags, setFeatureFlag } from './feature-flags.js';
import { decodeWatermarks, encodeWatermark } from './watermark.js';
import { bulkLocalEnabled, createBulkLocal, ensureBulkLocal, startBulkPaystackTest, startBulkCheckoutTest, verifyBulkPaymentTest, NGN_PRICE_KOBO, USD_PRICE_CENTS } from './bulk-local.js';
import { ensurePasswordResetSchema, isRecoveryEmail, sendPasswordReset } from './password-reset.js';
import { createPassword, generatePassword } from './passwords.js';

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
  if (['/api/admin/bulk-local', '/api/admin/bulk-local/paystack', '/api/admin/bulk-local/checkout', '/api/admin/bulk-local/verify'].includes(path)) {
    if (!bulkLocalEnabled(request, env)) return json({ error: 'Not found' }, 404);
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (request.method === 'POST' && (!sameOrigin(request) || !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json'))) return json({ error: 'Request not allowed.' }, 403);
    await env.OBI_DB.exec(schema);
    const admin = await session(request, env);
    if (!admin) return json({ error: 'Administrator sign-in required.' }, 401);
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const result = path.endsWith('/paystack') ? await startBulkPaystackTest(env, admin.admin_email, body.email, body.quantity)
        : path.endsWith('/checkout') ? await startBulkCheckoutTest(env, admin.admin_email, body.email, body.quantity, body.provider, body.discount)
        : path.endsWith('/verify') ? await verifyBulkPaymentTest(env, body.id)
        : await createBulkLocal(env, admin.admin_email, body.quantity);
      return json(result.body, result.status);
    }
    if (path !== '/api/admin/bulk-local') return json({ error: 'Method not allowed.' }, 405);
    await ensureBulkLocal(env);
    const orders = await env.OBI_DB.prepare(`SELECT o.id,o.code_last4,o.quantity,o.status,o.created_at,COUNT(r.account_id) AS used
      FROM bulk_local_orders o LEFT JOIN bulk_local_redemptions r ON r.order_id=o.id
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100`).all();
    const payments = await env.OBI_DB.prepare(`SELECT p.id,p.buyer_email,p.quantity,p.status,p.created_at,
      COALESCE(d.provider,'paystack') AS provider,COALESCE(d.currency,'NGN') AS currency,
      COALESCE(d.total_minor,p.amount_kobo) AS total_minor, COALESCE(x.percentage,0) AS discount_percentage, x.approval_note, x.approved_by
      FROM bulk_local_payments p LEFT JOIN bulk_local_payment_details d ON d.order_id=p.id LEFT JOIN bulk_local_discounts x ON x.order_id=p.id
      ORDER BY p.created_at DESC LIMIT 100`).all();
    return json({
      items: orders.results, payments: payments.results,
      unitPrices: { NGN: NGN_PRICE_KOBO, USD: USD_PRICE_CENTS }, unitPriceKobo: NGN_PRICE_KOBO,
      gateways: { paystack: Boolean(env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')), stripe: Boolean(env.OBI_STRIPE_SECRET_KEY?.startsWith('sk_test_')) },
    });
  }
  if (!['/api/admin/login', '/api/admin/session', '/api/admin/logout'].includes(path)) {
    if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    await env.OBI_DB.exec(schema);
    const sess = await session(request, env);
    if (!sess) return json({ error: 'Administrator sign-in required.' }, 401);
    // Basic audit log
    try {
      await env.OBI_DB.prepare('CREATE TABLE IF NOT EXISTS admin_audit_log (id TEXT PRIMARY KEY, admin_email TEXT NOT NULL, action TEXT NOT NULL, path TEXT NOT NULL, ip TEXT, created_at TEXT NOT NULL)').run();
      await env.OBI_DB.prepare('INSERT INTO admin_audit_log (id,admin_email,action,path,ip,created_at) VALUES (?,?,?,?,?,?)').bind('aa_' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b=>b.toString(16).padStart(2,'0')).join(''), sess.admin_email, request.method, path, request.headers.get('cf-connecting-ip') || 'unknown', new Date().toISOString()).run();
    } catch {}
    if (path === '/api/admin/readers/password-reset') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!sameOrigin(request) || !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Request not allowed.' }, 403);
      const body = await request.json().catch(() => ({}));
      const accountId = typeof body.account_id === 'string' ? body.account_id.trim() : '';
      const mode = body.mode === 'temporary' ? 'temporary' : body.mode === 'email' ? 'email' : '';
      if (!/^acct_[A-Za-z0-9]{12,64}$/.test(accountId) || !mode) return json({ error: 'Choose a valid reader and recovery method.' }, 400);
      await ensurePasswordResetSchema(env);
      const account = await env.OBI_DB.prepare('SELECT id,email,phone FROM obi_accounts WHERE id=?').bind(accountId).first();
      if (!account) return json({ error: 'Reader account not found.' }, 404);
      try {
        await env.OBI_DB.prepare('INSERT INTO admin_audit_log (id,admin_email,action,path,ip,created_at) VALUES (?,?,?,?,?,?)')
          .bind('aa_' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''), sess.admin_email, `PASSWORD_RESET_${mode.toUpperCase()}`, `${path}?account_id=${encodeURIComponent(accountId)}`, request.headers.get('cf-connecting-ip') || 'unknown', new Date().toISOString())
          .run();
      } catch {}
      if (mode === 'email') {
        if (!isRecoveryEmail(account.email)) return json({ error: 'This account has no recovery email. Create a temporary password instead.' }, 400);
        const result = await sendPasswordReset(env, account);
        return json(result.body, result.status);
      }
      const temporaryPassword = generatePassword(18);
      const { salt, hash } = await createPassword(temporaryPassword);
      const now = new Date().toISOString();
      await env.OBI_DB.batch([
        env.OBI_DB.prepare('UPDATE obi_accounts SET password_hash=?,password_salt=?,last_signed_in=? WHERE id=?').bind(hash, salt, now, accountId),
        env.OBI_DB.prepare('DELETE FROM obi_account_sessions WHERE account_id=?').bind(accountId),
        env.OBI_DB.prepare('UPDATE account_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL').bind(now, accountId),
      ]);
      return json({
        ok: true,
        temporary_password: temporaryPassword,
        message: 'Temporary password created. Existing reader sign-ins were revoked. Share it securely and ask the reader to change it at /security.',
      });
    }
    if (path === '/api/admin/features') {
      if (request.method === 'GET') return json({ features: await getAdminFeatureFlags(env) });
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!sameOrigin(request) || !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Request not allowed.' }, 403);
      const body = await request.json().catch(() => ({}));
      const result = await setFeatureFlag(env, body.key, body.enabled === true, sess.admin_email);
      return json(result.body, result.status);
    }
    if (path === '/api/admin/pricing') {
      if (request.method === 'GET') return json({ pricing: await getPricing(env) });
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!sameOrigin(request) || !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Request not allowed.' }, 403);
      const body = await request.json().catch(() => ({}));
      const parsed = validatePricing(body);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      return json({ pricing: await savePricing(env, parsed, sess.admin_email) });
    }
    if (path === '/api/admin/forensic/sample') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!sameOrigin(request) || !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Request not allowed.' }, 403);
      const row = await env.OBI_DB.prepare('SELECT checkout_session_id FROM purchases ORDER BY granted_at DESC LIMIT 1').first();
      if (!row) return json({ error: 'No purchases are available for a sample.' }, 404);
      return json({
        text: `This is a sample leaked passage from a licensed OBI-ISM reader.${encodeWatermark(row.checkout_session_id)} If this text were shared, the invisible identifier above would identify the copy.`,
        reference: row.checkout_session_id,
      });
    }
    if (path === '/api/admin/forensic') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!sameOrigin(request) || !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Request not allowed.' }, 403);
      const body = await request.json().catch(() => ({}));
      const ids = decodeWatermarks(typeof body.text === 'string' ? body.text.slice(0, 200000) : '');
      const matches = [];
      for (const id of ids) {
        const row = await env.OBI_DB.prepare('SELECT checkout_session_id,purchaser_email,granted_at FROM purchases WHERE checkout_session_id=?').bind(id).first();
        if (row) matches.push(row);
      }
      return json({ ids, matches });
    }
    if (path === '/api/admin/bulk-order/action') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!sameOrigin(request) || !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Request not allowed.' }, 403);
      const body = await request.json().catch(() => ({}));
      const result = await setBulkOrderClaimsState(env, body.order_id, body.action, sess.admin_email);
      return json(result.body, result.status);
    }
    if (path === '/api/admin/audit' && request.method === 'GET') {
      try {
        const rows = await env.OBI_DB.prepare('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 200').all();
        return json({ items: rows.results || [] });
      } catch { return json({ items: [] }); }
    }
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
