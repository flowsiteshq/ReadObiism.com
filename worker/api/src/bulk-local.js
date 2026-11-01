// Isolated local prototype only. Provider test payments are verified server-side.
import { hashDeviceToken } from './security.js';
import { NGN_PRICE_KOBO, USD_PRICE_CENTS, EDITION_SKU } from './pricing.js';
export { NGN_PRICE_KOBO, USD_PRICE_CENTS };

export const bulkLocalSchema = `
CREATE TABLE IF NOT EXISTS bulk_local_orders (id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, code_last4 TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000), status TEXT NOT NULL CHECK(status='local_test'), created_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bulk_local_redemptions (order_id TEXT NOT NULL, account_id TEXT NOT NULL, checkout_session_id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(order_id, account_id));
CREATE INDEX IF NOT EXISTS bulk_local_redemptions_order_idx ON bulk_local_redemptions(order_id);
CREATE TABLE IF NOT EXISTS bulk_local_payments (id TEXT PRIMARY KEY, provider_reference TEXT UNIQUE NOT NULL, buyer_email TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000), amount_kobo INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','paid','initialization_failed')), created_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bulk_local_payment_details (order_id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('paystack','stripe')), currency TEXT NOT NULL, unit_amount_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL, stripe_session_id TEXT);
CREATE TABLE IF NOT EXISTS bulk_local_discounts (order_id TEXT PRIMARY KEY, percentage INTEGER NOT NULL CHECK(percentage BETWEEN 1 AND 99), approval_note TEXT NOT NULL, approved_by TEXT NOT NULL);`;

export function bulkLocalEnabled(request, env) {
  const url = new URL(request.url);
  return env.OBI_BULK_LOCAL_TEST === '1' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
}
export async function ensureBulkLocal(env) { await env.OBI_DB.exec(bulkLocalSchema); }
function randomHex(bytes) { return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join(''); }
export async function createBulkLocal(env, adminEmail, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return { status: 400, body: { error: 'Enter a whole number between 1 and 1000.' } };
  await ensureBulkLocal(env);
  const code = 'OBI-BULK-' + randomHex(16).toUpperCase();
  const id = 'bulk_' + randomHex(16);
  await env.OBI_DB.prepare('INSERT INTO bulk_local_orders (id,code_hash,code_last4,quantity,status,created_by,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, await hashDeviceToken(code), code.slice(-4), quantity, 'local_test', adminEmail, new Date().toISOString()).run();
  return { status: 201, body: { id, code, quantity, testOnly: true } };
}
async function paymentCode(env, orderId) {
  if (!/^[a-f0-9]{64}$/.test(env.OBI_BULK_LOCAL_CODE_SECRET || '')) throw new Error('Local bulk code secret is not configured.');
  const bytes = Uint8Array.from(env.OBI_BULK_LOCAL_CODE_SECRET.match(/../g), (hex) => parseInt(hex, 16));
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(orderId)));
  return 'OBI-BULK-' + Array.from(digest.slice(0, 16), (n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function bulkPrice(standardUnit, input) {
  if (input == null) return { unit: standardUnit, discount: null };
  if (typeof input !== 'object' || !Number.isInteger(input.percentage) || input.percentage < 1 || input.percentage > 99 || input.confirmed !== true || typeof input.note !== 'string' || input.note.trim().length < 3 || input.note.trim().length > 200) return null;
  return { unit: Math.round(standardUnit * (100 - input.percentage) / 100), discount: { percentage: input.percentage, note: input.note.trim() } };
}
function discountStatement(env, id, adminEmail, discount) {
  return env.OBI_DB.prepare('INSERT INTO bulk_local_discounts (order_id,percentage,approval_note,approved_by) VALUES (?,?,?,?)').bind(id, discount.percentage, discount.note, adminEmail);
}
export async function startBulkPaystackTest(env, adminEmail, emailInput, quantity, discountInput = null) {
  const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return { status: 400, body: { error: 'Enter a valid buyer email and a quantity from 1 to 1000.' } };
  const price = bulkPrice(NGN_PRICE_KOBO, discountInput);
  if (!price) return { status: 400, body: { error: 'Enter a whole discount from 1 to 99%, an approval note and confirmation.' } };
  if (!env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_') || !/^[a-f0-9]{64}$/.test(env.OBI_BULK_LOCAL_CODE_SECRET || '')) return { status: 503, body: { error: 'Local Paystack test settings are not configured.' } };
  await ensureBulkLocal(env);
  const id = 'bulk_' + randomHex(16), reference = 'obi_' + randomHex(16), amount = price.unit * quantity, now = new Date().toISOString();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare('INSERT INTO bulk_local_payments (id,provider_reference,buyer_email,quantity,amount_kobo,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, reference, email, quantity, amount, 'pending', adminEmail, now),
    env.OBI_DB.prepare('INSERT INTO bulk_local_payment_details (order_id,provider,currency,unit_amount_minor,total_minor) VALUES (?,?,?,?,?)').bind(id, 'paystack', 'NGN', price.unit, amount),
    ...(price.discount ? [discountStatement(env, id, adminEmail, price.discount)] : []),
  ]);
  try {
    const api = String(env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/+$/, '');
    const response = await fetch(api + '/transaction/initialize', {
      method: 'POST', headers: { authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, amount, currency: 'NGN', reference, callback_url: 'http://127.0.0.1:5514/admin/?bulk_order=' + encodeURIComponent(id) + '#bulk', metadata: { bulk_local_test: '1', bulk_order_id: id, quantity } }),
    });
    const result = await response.json().catch(() => ({}));
    const checkout = result?.data?.authorization_url;
    let allowed = false;
    try { const url = new URL(checkout); allowed = url.protocol === 'https:' && url.hostname === 'checkout.paystack.com'; } catch {}
    if (!response.ok || !result.status || !allowed || result?.data?.reference !== reference) throw new Error('Provider rejected checkout.');
    return { status: 201, body: { id, checkout_url: checkout, quantity, amount_kobo: amount, testOnly: true } };
  } catch {
    await env.OBI_DB.prepare("UPDATE bulk_local_payments SET status='initialization_failed' WHERE id=? AND status='pending'").bind(id).run();
    return { status: 502, body: { error: 'Could not start Paystack test checkout. Check the test key and connection.' } };
  }
}
export async function startBulkStripeTest(env, adminEmail, emailInput, quantity, discountInput = null) {
  const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return { status: 400, body: { error: 'Enter a valid buyer email and a quantity from 1 to 1000.' } };
  const price = bulkPrice(USD_PRICE_CENTS, discountInput);
  if (!price) return { status: 400, body: { error: 'Enter a whole discount from 1 to 99%, an approval note and confirmation.' } };
  if (!env.OBI_STRIPE_SECRET_KEY?.startsWith('sk_test_') || !/^[a-f0-9]{64}$/.test(env.OBI_BULK_LOCAL_CODE_SECRET || '')) return { status: 503, body: { error: 'Local Stripe test settings are not configured.' } };
  await ensureBulkLocal(env);
  const id = 'bulk_' + randomHex(16), reference = 'obi_' + randomHex(16), amount = price.unit * quantity, now = new Date().toISOString();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare('INSERT INTO bulk_local_payments (id,provider_reference,buyer_email,quantity,amount_kobo,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, reference, email, quantity, 0, 'pending', adminEmail, now),
    env.OBI_DB.prepare('INSERT INTO bulk_local_payment_details (order_id,provider,currency,unit_amount_minor,total_minor) VALUES (?,?,?,?,?)').bind(id, 'stripe', 'USD', price.unit, amount),
    ...(price.discount ? [discountStatement(env, id, adminEmail, price.discount)] : []),
  ]);
  try {
    const callback = 'http://127.0.0.1:5514/admin/?bulk_order=' + encodeURIComponent(id) + '#bulk';
    const form = new URLSearchParams({
      mode: 'payment', customer_email: email, success_url: callback, cancel_url: callback,
      'client_reference_id': id, 'metadata[bulk_local_test]': '1', 'metadata[bulk_order_id]': id,
      'metadata[quantity]': String(quantity), 'metadata[product_sku]': EDITION_SKU,
      'line_items[0][quantity]': String(quantity), 'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(price.unit),
      'line_items[0][price_data][product_data][name]': 'OBI-ISM digital edition (bulk test)',
    });
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST', headers: { authorization: 'Bearer ' + env.OBI_STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' }, body: form,
    });
    const result = await response.json().catch(() => ({}));
    let allowed = false;
    try { const url = new URL(result.url); allowed = url.protocol === 'https:' && url.hostname === 'checkout.stripe.com'; } catch {}
    if (!response.ok || !allowed || !/^cs_test_[A-Za-z0-9_]{12,255}$/.test(result.id || '') || result.livemode !== false) throw new Error('Provider rejected checkout.');
    await env.OBI_DB.prepare('UPDATE bulk_local_payment_details SET stripe_session_id=? WHERE order_id=?').bind(result.id, id).run();
    return { status: 201, body: { id, checkout_url: result.url, quantity, currency: 'USD', total_minor: amount, testOnly: true } };
  } catch {
    await env.OBI_DB.prepare("UPDATE bulk_local_payments SET status='initialization_failed' WHERE id=? AND status='pending'").bind(id).run();
    return { status: 502, body: { error: 'Could not start Stripe test checkout. Check the test key and connection.' } };
  }
}
/** @param {any} [discount] */
export async function startBulkCheckoutTest(env, adminEmail, email, quantity, provider, discount = null) {
  if (provider === 'paystack') return startBulkPaystackTest(env, adminEmail, email, quantity, discount);
  if (provider === 'stripe') return startBulkStripeTest(env, adminEmail, email, quantity, discount);
  return { status: 400, body: { error: 'Choose a supported payment gateway.' } };
}
async function grantVerifiedOrder(env, order) {
  const code = await paymentCode(env, order.id), hash = await hashDeviceToken(code);
  await env.OBI_DB.batch([
    env.OBI_DB.prepare("UPDATE bulk_local_payments SET status='paid' WHERE id=? AND status='pending'").bind(order.id),
    env.OBI_DB.prepare(`INSERT OR IGNORE INTO bulk_local_orders (id,code_hash,code_last4,quantity,status,created_by,created_at)
      SELECT id,?,?,quantity,'local_test',created_by,created_at FROM bulk_local_payments WHERE id=? AND status='paid'`).bind(hash, code.slice(-4), order.id),
  ]);
}
async function recoverPaidOrder(env, order) {
  const code = await paymentCode(env, order.id);
  const stored = await env.OBI_DB.prepare('SELECT code_hash FROM bulk_local_orders WHERE id=?').bind(order.id).first();
  if (!stored || stored.code_hash !== await hashDeviceToken(code)) return { status: 503, body: { error: 'The local test code cannot be recovered. Check the local code secret.' } };
  return { status: 200, body: { id: order.id, status: 'paid', code, quantity: order.quantity, testOnly: true } };
}
export async function verifyBulkPaystackTest(env, id) {
  if (!/^bulk_[a-f0-9]{32}$/.test(id || '')) return { status: 400, body: { error: 'Invalid test order.' } };
  if (!env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_') || !/^[a-f0-9]{64}$/.test(env.OBI_BULK_LOCAL_CODE_SECRET || '')) return { status: 503, body: { error: 'Local Paystack test settings are not configured.' } };
  await ensureBulkLocal(env);
  const order = await env.OBI_DB.prepare('SELECT * FROM bulk_local_payments WHERE id=?').bind(id).first();
  if (!order) return { status: 404, body: { error: 'Test order not found.' } };
  const detail = await env.OBI_DB.prepare('SELECT provider FROM bulk_local_payment_details WHERE order_id=?').bind(id).first();
  if (detail && detail.provider !== 'paystack') return { status: 400, body: { error: 'This order uses a different gateway.' } };
  if (order.status === 'initialization_failed') return { status: 409, body: { error: 'This test checkout could not be started.' } };
  if (order.status !== 'paid') {
    let response, result;
    try {
      const api = String(env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/+$/, '');
      response = await fetch(api + '/transaction/verify/' + encodeURIComponent(order.provider_reference), { headers: { authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY } });
      result = await response.json();
    } catch { return { status: 502, body: { error: 'Could not reach Paystack to verify this test payment.' } }; }
    const tx = result?.data;
    if (!response.ok || !result.status || !tx) return { status: 502, body: { error: 'Paystack could not verify this test payment.' } };
    if (tx.status !== 'success') return { status: 200, body: { id, status: 'pending', code: undefined, message: 'The test payment has not been confirmed yet.' } };
    let metadata = tx.metadata;
    if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { metadata = null; } }
    if (tx.reference !== order.provider_reference || String(tx.currency).toUpperCase() !== 'NGN' || Number(tx.amount) !== order.amount_kobo
      || String(tx.customer?.email || '').trim().toLowerCase() !== order.buyer_email
      || metadata?.bulk_local_test !== '1' || metadata?.bulk_order_id !== id || Number(metadata?.quantity) !== order.quantity) {
      return { status: 400, body: { error: 'The verified payment does not match this test order.' } };
    }
    await grantVerifiedOrder(env, order);
  }
  return recoverPaidOrder(env, order);
}
export async function verifyBulkStripeTest(env, id) {
  if (!/^bulk_[a-f0-9]{32}$/.test(id || '')) return { status: 400, body: { error: 'Invalid test order.' } };
  if (!env.OBI_STRIPE_SECRET_KEY?.startsWith('sk_test_') || !/^[a-f0-9]{64}$/.test(env.OBI_BULK_LOCAL_CODE_SECRET || '')) return { status: 503, body: { error: 'Local Stripe test settings are not configured.' } };
  await ensureBulkLocal(env);
  const order = await env.OBI_DB.prepare('SELECT p.*,d.provider,d.currency,d.total_minor,d.stripe_session_id FROM bulk_local_payments p JOIN bulk_local_payment_details d ON d.order_id=p.id WHERE p.id=?').bind(id).first();
  if (!order || order.provider !== 'stripe') return { status: 404, body: { error: 'Stripe test order not found.' } };
  if (order.status === 'initialization_failed' || !/^cs_test_[A-Za-z0-9_]{12,255}$/.test(order.stripe_session_id || '')) return { status: 409, body: { error: 'This test checkout could not be started.' } };
  if (order.status !== 'paid') {
    let response, session;
    try {
      response = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(order.stripe_session_id), { headers: { authorization: 'Bearer ' + env.OBI_STRIPE_SECRET_KEY } });
      session = await response.json();
    } catch { return { status: 502, body: { error: 'Could not reach Stripe to verify this test payment.' } }; }
    if (!response.ok || !session?.id) return { status: 502, body: { error: 'Stripe could not verify this test payment.' } };
    if (session.status !== 'complete' || session.payment_status !== 'paid') return { status: 200, body: { id, status: 'pending', code: undefined, message: 'The test payment has not been confirmed yet.' } };
    if (session.id !== order.stripe_session_id || session.livemode !== false || String(session.currency || '').toUpperCase() !== order.currency
      || Number(session.amount_total) !== order.total_minor || String(session.customer_email || '').trim().toLowerCase() !== order.buyer_email
      || session.client_reference_id !== id || session.metadata?.bulk_local_test !== '1' || session.metadata?.bulk_order_id !== id
      || Number(session.metadata?.quantity) !== order.quantity || session.metadata?.product_sku !== EDITION_SKU) {
      return { status: 400, body: { error: 'The verified payment does not match this test order.' } };
    }
    await grantVerifiedOrder(env, order);
  }
  return recoverPaidOrder(env, order);
}
export async function verifyBulkPaymentTest(env, id) {
  if (!/^bulk_[a-f0-9]{32}$/.test(id || '')) return { status: 400, body: { error: 'Invalid test order.' } };
  await ensureBulkLocal(env);
  const row = await env.OBI_DB.prepare('SELECT provider FROM bulk_local_payment_details WHERE order_id=?').bind(id).first();
  return row?.provider === 'stripe' ? verifyBulkStripeTest(env, id) : verifyBulkPaystackTest(env, id);
}
export async function redeemBulkLocal(env, account, codeInput, deviceHash) {
  const code = typeof codeInput === 'string' ? codeInput.trim().toUpperCase() : '';
  if (!/^OBI-BULK-[A-F0-9]{32}$/.test(code)) return { status: 400, body: { error: 'Enter a valid bulk test code.' } };
  await ensureBulkLocal(env);
  const order = await env.OBI_DB.prepare('SELECT id,quantity,status FROM bulk_local_orders WHERE code_hash=?').bind(await hashDeviceToken(code)).first();
  if (!order) return { status: 404, body: { error: 'That bulk test code was not found.' } };
  const existing = await env.OBI_DB.prepare('SELECT checkout_session_id FROM bulk_local_redemptions WHERE order_id=? AND account_id=?').bind(order.id, account.id).first();
  if (existing) return { status: 200, body: { session_id: existing.checkout_session_id, alreadyRedeemed: true } };
  const reference = 'obi_' + randomHex(16), now = new Date().toISOString();
  // D1 batch statements are one transaction. The capacity predicate is checked
  // during the write, and later inserts depend on this specific claim existing.
  const results = await env.OBI_DB.batch([
    env.OBI_DB.prepare(`INSERT OR IGNORE INTO bulk_local_redemptions (order_id,account_id,checkout_session_id,created_at)
      SELECT id,?,?,? FROM bulk_local_orders WHERE id=? AND status='local_test'
      AND (SELECT COUNT(*) FROM bulk_local_redemptions WHERE order_id=bulk_local_orders.id)<quantity`)
      .bind(account.id, reference, now, order.id),
    env.OBI_DB.prepare(`INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at)
      SELECT checkout_session_id,?,?,0,'NGN',?,'active',? FROM bulk_local_redemptions WHERE checkout_session_id=?`)
      .bind('local-bulk-test:' + order.id, account.email, EDITION_SKU, now, reference),
    env.OBI_DB.prepare(`INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at)
      SELECT checkout_session_id,?,? FROM bulk_local_redemptions WHERE checkout_session_id=?`)
      .bind(deviceHash, now, reference),
  ]);
  if (Number(results[0]?.meta?.changes || 0) > 0) return { status: 200, body: { session_id: reference, redeemed: true } };
  const retry = await env.OBI_DB.prepare('SELECT checkout_session_id FROM bulk_local_redemptions WHERE order_id=? AND account_id=?').bind(order.id, account.id).first();
  return retry
    ? { status: 200, body: { session_id: retry.checkout_session_id, alreadyRedeemed: true } }
    : { status: 409, body: { error: 'All activations for this bulk test code have been used.' } };
}
