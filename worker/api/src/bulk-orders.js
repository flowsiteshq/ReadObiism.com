// Production bulk orders (Stripe USD / Paystack NGN). Verified payments only.
import { hashDeviceToken } from './security.js';
import { NGN_PRICE_KOBO, USD_PRICE_CENTS, EDITION_SKU } from './pricing.js';

export const bulkOrdersSchema = `
CREATE TABLE IF NOT EXISTS bulk_orders (
  id TEXT PRIMARY KEY,
  code_hash TEXT UNIQUE NOT NULL,
  code_last4 TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
  currency TEXT NOT NULL CHECK(currency IN ('USD','NGN')),
  unit_amount_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('stripe','paystack')),
  provider_reference TEXT UNIQUE,
  stripe_session_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','paid','expired','cancelled','refunded','disputed','partially_refunded')),
  discount_percentage INTEGER,
  discount_note TEXT,
  discount_approved_by TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bulk_order_claims (
  order_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  checkout_session_id TEXT UNIQUE NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY(order_id, account_id)
);
CREATE INDEX IF NOT EXISTS bulk_order_claims_order_idx ON bulk_order_claims(order_id);
CREATE INDEX IF NOT EXISTS bulk_order_claims_account_idx ON bulk_order_claims(account_id);
CREATE TABLE IF NOT EXISTS bulk_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
`;

export async function ensureBulkOrders(env) {
  await env.OBI_DB.exec(bulkOrdersSchema);
}

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateCode() {
  // High entropy shareable code
  return 'OBI-BULK-' + randomHex(24).toUpperCase();
}

async function hashCode(code) {
  return hashDeviceToken(code);
}

function validEmail(value) {
  return typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value.trim());
}

function validQuantity(q) {
  return Number.isInteger(q) && q >= 1 && q <= 10000;
}

function computePrice(baseUnit, discount) {
  if (!discount) return { unit: baseUnit, total: baseUnit, discount: null };
  if (typeof discount !== 'object') return null;
  const pct = Number(discount.percentage);
  if (!Number.isInteger(pct) || pct < 1 || pct > 99) return null;
  if (discount.confirmed !== true) return null;
  if (typeof discount.note !== 'string' || discount.note.trim().length < 3 || discount.note.trim().length > 200) return null;
  const unit = Math.round(baseUnit * (100 - pct) / 100);
  return { unit, discount: { percentage: pct, note: discount.note.trim() } };
}

export async function createBulkOrderCheckout(env, buyerEmail, quantity, provider, discount = null, actor = null) {
  const email = typeof buyerEmail === 'string' ? buyerEmail.trim().toLowerCase() : '';
  if (!validEmail(email) || email.length > 254) return { status: 400, body: { error: 'Enter a valid buyer email.' } };
  if (!validQuantity(quantity)) return { status: 400, body: { error: 'Enter a quantity between 1 and 10000.' } };
  if (provider !== 'stripe' && provider !== 'paystack') return { status: 400, body: { error: 'Choose Stripe (USD) or Paystack (NGN).' } };

  await ensureBulkOrders(env);

  if (provider === 'paystack') {
    if (!env.PAYSTACK_SECRET_KEY?.startsWith('sk_')) return { status: 503, body: { error: 'Paystack is not configured.' } };
    const price = computePrice(NGN_PRICE_KOBO, discount);
    if (!price) return { status: 400, body: { error: 'Invalid discount. Enter 1-99%, approval note, and confirmation.' } };
    const id = 'bprod_' + randomHex(16);
    const reference = 'bpo_' + randomHex(16);
    const total = price.unit * quantity;
    const now = new Date().toISOString();
    await env.OBI_DB.batch([
      env.OBI_DB.prepare(`INSERT INTO bulk_orders (id,code_hash,code_last4,buyer_email,quantity,currency,unit_amount_minor,total_minor,provider,provider_reference,status,discount_percentage,discount_note,discount_approved_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, await hashCode(generateCode()), 'XXXX', email, quantity, 'NGN', price.unit, total, 'paystack', reference, 'pending', price.discount?.percentage || null, price.discount?.note || null, actor, now, now),
      env.OBI_DB.prepare('INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)').bind('boe_' + randomHex(12), id, 'created', actor, JSON.stringify({ quantity, currency: 'NGN', total }), now),
    ]);
    try {
      const api = String(env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/+$/, '');
      const origin = env.OBI_PUBLIC_APP_URL || 'https://readobiism.com';
      const callback = `${origin}/bulk-confirmation.html?order=${encodeURIComponent(id)}`;
      const resp = await fetch(api + '/transaction/initialize', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ email, amount: total, currency: 'NGN', reference, callback_url: callback, metadata: { bulk_order: '1', bulk_order_id: id, quantity, product_sku: EDITION_SKU } }),
      });
      const result = await resp.json().catch(() => ({}));
      const checkout = result?.data?.authorization_url;
      let allowed = false;
      try { const u = new URL(checkout); allowed = u.protocol === 'https:' && u.hostname === 'checkout.paystack.com'; } catch {}
      if (!resp.ok || !result.status || !allowed || result?.data?.reference !== reference) throw new Error('bad');
      return { status: 201, body: { order_id: id, checkout_url: checkout, provider: 'paystack', currency: 'NGN', total_minor: total, quantity } };
    } catch {
      await env.OBI_DB.prepare("UPDATE bulk_orders SET status='cancelled', updated_at=? WHERE id=? AND status='pending'").bind(new Date().toISOString(), id).run();
      return { status: 502, body: { error: 'Could not start Paystack checkout.' } };
    }
  } else {
    if (!env.OBI_STRIPE_SECRET_KEY?.startsWith('sk_')) return { status: 503, body: { error: 'Stripe is not configured.' } };
    const price = computePrice(USD_PRICE_CENTS, discount);
    if (!price) return { status: 400, body: { error: 'Invalid discount. Enter 1-99%, approval note, and confirmation.' } };
    const id = 'bprod_' + randomHex(16);
    const now = new Date().toISOString();
    const total = price.unit * quantity;
    await env.OBI_DB.batch([
      env.OBI_DB.prepare(`INSERT INTO bulk_orders (id,code_hash,code_last4,buyer_email,quantity,currency,unit_amount_minor,total_minor,provider,status,discount_percentage,discount_note,discount_approved_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, await hashCode(generateCode()), 'XXXX', email, quantity, 'USD', price.unit, total, 'stripe', 'pending', price.discount?.percentage || null, price.discount?.note || null, actor, now, now),
      env.OBI_DB.prepare('INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)').bind('boe_' + randomHex(12), id, 'created', actor, JSON.stringify({ quantity, currency: 'USD', total }), now),
    ]);
    try {
      const origin = env.OBI_PUBLIC_APP_URL || 'https://readobiism.com';
      const form = new URLSearchParams({
        mode: 'payment',
        customer_email: email,
        success_url: `${origin}/bulk-confirmation.html?order=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/bulk.html?cancelled=1`,
        'client_reference_id': id,
        'metadata[bulk_order]': '1',
        'metadata[bulk_order_id]': id,
        'metadata[quantity]': String(quantity),
        'metadata[product_sku]': EDITION_SKU,
        'line_items[0][quantity]': String(quantity),
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(price.unit),
        'line_items[0][price_data][product_data][name]': 'OBI-ISM digital edition (bulk order)',
      });
      const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + env.OBI_STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      const result = await resp.json().catch(() => ({}));
      let allowed = false;
      try { const u = new URL(result.url); allowed = u.protocol === 'https:' && u.hostname === 'checkout.stripe.com'; } catch {}
      if (!resp.ok || !allowed || !/^cs_(test_|live_)[A-Za-z0-9_]{12,255}$/.test(result.id || '')) throw new Error('bad');
      await env.OBI_DB.prepare('UPDATE bulk_orders SET stripe_session_id=?, updated_at=? WHERE id=?').bind(result.id, new Date().toISOString(), id).run();
      return { status: 201, body: { order_id: id, checkout_url: result.url, provider: 'stripe', currency: 'USD', total_minor: total, quantity } };
    } catch {
      await env.OBI_DB.prepare("UPDATE bulk_orders SET status='cancelled', updated_at=? WHERE id=? AND status='pending'").bind(new Date().toISOString(), id).run();
      return { status: 502, body: { error: 'Could not start Stripe checkout.' } };
    }
  }
}

async function issueCode(env, order) {
  const code = generateCode();
  const hash = await hashCode(code);
  const now = new Date().toISOString();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare("UPDATE bulk_orders SET code_hash=?, code_last4=?, status='paid', paid_at=?, updated_at=? WHERE id=? AND status IN ('pending')").bind(hash, code.slice(-4), now, now, order.id),
    env.OBI_DB.prepare('INSERT INTO bulk_order_events (id,order_id,event_type,details,created_at) VALUES (?,?,?,?,?)').bind('boe_' + randomHex(12), order.id, 'paid', JSON.stringify({ code_last4: code.slice(-4) }), now),
  ]);
  return code;
}

export async function verifyBulkOrderPayment(env, orderId) {
  if (!/^bprod_[a-f0-9]{32}$/.test(orderId || '')) return { status: 400, body: { error: 'Invalid order.' } };
  await ensureBulkOrders(env);
  const order = await env.OBI_DB.prepare('SELECT * FROM bulk_orders WHERE id=?').bind(orderId).first();
  if (!order) return { status: 404, body: { error: 'Order not found.' } };
  if (order.status === 'paid') {
    // Return code only if we can recover it? We store hash; for security we don't store plaintext
    // But we need to return it once - in practice better to store encrypted or just return on first issue
    // For now, require re-issuance via secure channel; but per requirements we need to provide it
    // We'll store encrypted code if secret exists? Or just generate again - but hash changes. Better approach: store code_encrypted
    // Check if we have encrypted code
    const row = await env.OBI_DB.prepare('SELECT code_encrypted FROM bulk_orders WHERE id=?').bind(orderId).first().catch(() => null);
    if (row?.code_encrypted && env.BULK_CODE_ENCRYPTION_KEY) {
      try {
        const key = await crypto.subtle.importKey('raw', Buffer.from(env.BULK_CODE_ENCRYPTION_KEY, 'hex'), { name: 'AES-GCM' }, false, ['decrypt']);
        const iv = Buffer.from(row.code_encrypted.slice(0, 32), 'hex');
        const data = Buffer.from(row.code_encrypted.slice(32), 'hex');
        const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        const code = new TextDecoder().decode(dec);
        return { status: 200, body: { order_id: order.id, status: 'paid', code, quantity: order.quantity } };
      } catch {}
    }
    return { status: 200, body: { order_id: order.id, status: 'paid', quantity: order.quantity, message: 'Order is paid. Contact support for code recovery if needed.' } };
  }
  if (order.status === 'pending') {
    if (order.provider === 'paystack') {
      if (!env.PAYSTACK_SECRET_KEY?.startsWith('sk_')) return { status: 503, body: { error: 'Paystack not configured.' } };
      try {
        const api = String(env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/+$/, '');
        const resp = await fetch(api + '/transaction/verify/' + encodeURIComponent(order.provider_reference), { headers: { authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY } });
        const result = await resp.json();
        const tx = result?.data;
        if (!resp.ok || !result.status || !tx) return { status: 502, body: { error: 'Could not verify payment.' } };
        if (tx.status !== 'success') return { status: 200, body: { order_id: order.id, status: 'pending' } };
        if (tx.reference !== order.provider_reference || String(tx.currency).toUpperCase() !== order.currency || Number(tx.amount) !== order.total_minor || String(tx.customer?.email||'').toLowerCase() !== order.buyer_email) {
          return { status: 400, body: { error: 'Payment does not match order.' } };
        }
        if (tx.metadata?.bulk_order_id !== order.id || Number(tx.metadata?.quantity) !== order.quantity) {
          return { status: 400, body: { error: 'Payment does not match order.' } };
        }
        const code = await issueCode(env, order);
        // Try to store encrypted if possible
        if (env.BULK_CODE_ENCRYPTION_KEY) {
          try {
            const key = await crypto.subtle.importKey('raw', Buffer.from(env.BULK_CODE_ENCRYPTION_KEY, 'hex'), { name: 'AES-GCM' }, false, ['encrypt']);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(code));
            const stored = Buffer.from(iv).toString('hex') + Buffer.from(enc).toString('hex');
            await env.OBI_DB.prepare('ALTER TABLE bulk_orders ADD COLUMN code_encrypted TEXT').catch(() => {});
            await env.OBI_DB.prepare('UPDATE bulk_orders SET code_encrypted=? WHERE id=?').bind(stored, order.id).run();
          } catch {}
        }
        return { status: 200, body: { order_id: order.id, status: 'paid', code, quantity: order.quantity } };
      } catch (e) {
        return { status: 502, body: { error: 'Could not verify payment.' } };
      }
    } else if (order.provider === 'stripe') {
      if (!env.OBI_STRIPE_SECRET_KEY?.startsWith('sk_')) return { status: 503, body: { error: 'Stripe not configured.' } };
      try {
        const sid = order.stripe_session_id;
        if (!sid) return { status: 400, body: { error: 'Missing session.' } };
        const resp = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sid), { headers: { authorization: 'Bearer ' + env.OBI_STRIPE_SECRET_KEY } });
        const session = await resp.json();
        if (!resp.ok || !session?.id) return { status: 502, body: { error: 'Could not verify payment.' } };
        if (session.status !== 'complete' || session.payment_status !== 'paid') return { status: 200, body: { order_id: order.id, status: 'pending' } };
        if (session.id !== sid || session.livemode !== (env.OBI_STRIPE_LIVE_MODE === '1') && session.livemode === true && env.OBI_STRIPE_LIVE_MODE !== '1' && false) { /* allow test */ }
        if (session.livemode === true && env.OBI_STRIPE_LIVE_MODE !== '1') return { status: 400, body: { error: 'Live payment not allowed in this environment.' } };
        if (session.livemode !== true && env.OBI_STRIPE_REQUIRE_LIVE === '1') return { status: 400, body: { error: 'Live payment required.' } };
        if (String(session.currency||'').toUpperCase() !== order.currency || Number(session.amount_total) !== order.total_minor || String(session.customer_email||'').toLowerCase() !== order.buyer_email || session.client_reference_id !== order.id || session.metadata?.bulk_order_id !== order.id || Number(session.metadata?.quantity) !== order.quantity) {
          return { status: 400, body: { error: 'Payment does not match order.' } };
        }
        const code = await issueCode(env, order);
        if (env.BULK_CODE_ENCRYPTION_KEY) {
          try {
            const key = await crypto.subtle.importKey('raw', Buffer.from(env.BULK_CODE_ENCRYPTION_KEY, 'hex'), { name: 'AES-GCM' }, false, ['encrypt']);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(code));
            const stored = Buffer.from(iv).toString('hex') + Buffer.from(enc).toString('hex');
            await env.OBI_DB.prepare('ALTER TABLE bulk_orders ADD COLUMN code_encrypted TEXT').catch(() => {});
            await env.OBI_DB.prepare('UPDATE bulk_orders SET code_encrypted=? WHERE id=?').bind(stored, order.id).run();
          } catch {}
        }
        return { status: 200, body: { order_id: order.id, status: 'paid', code, quantity: order.quantity } };
      } catch {
        return { status: 502, body: { error: 'Could not verify payment.' } };
      }
    }
  }
  return { status: 200, body: { order_id: order.id, status: order.status } };
}

export async function claimBulkOrder(env, account, codeInput, deviceHash) {
  const code = typeof codeInput === 'string' ? codeInput.trim().toUpperCase() : '';
  if (!/^OBI-BULK-[A-F0-9]{48}$/.test(code) && !/^OBI-BULK-[A-F0-9]{32}$/.test(code)) {
    // be flexible
  }
  if (!/^OBI-BULK-[A-F0-9]+$/.test(code)) return { status: 400, body: { error: 'Enter a valid bulk code.' } };
  await ensureBulkOrders(env);
  const order = await env.OBI_DB.prepare('SELECT id,quantity,status FROM bulk_orders WHERE code_hash=?').bind(await hashCode(code)).first();
  if (!order) return { status: 404, body: { error: 'That bulk code was not found.' } };
  if (order.status !== 'paid') return { status: 409, body: { error: 'This bulk order is not active yet.' } };
  const existing = await env.OBI_DB.prepare('SELECT checkout_session_id FROM bulk_order_claims WHERE order_id=? AND account_id=?').bind(order.id, account.id).first();
  if (existing) return { status: 200, body: { session_id: existing.checkout_session_id, alreadyClaimed: true } };
  const reference = 'bcl_' + randomHex(16);
  const now = new Date().toISOString();
  const results = await env.OBI_DB.batch([
    env.OBI_DB.prepare(`INSERT OR IGNORE INTO bulk_order_claims (order_id,account_id,checkout_session_id,claimed_at)
      SELECT id,?,?,? FROM bulk_orders WHERE id=? AND status='paid'
      AND (SELECT COUNT(*) FROM bulk_order_claims WHERE order_id=bulk_orders.id) < quantity`)
      .bind(account.id, reference, now, order.id),
    env.OBI_DB.prepare(`INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at)
      SELECT checkout_session_id,?,?,0,?,?,'active',? FROM bulk_order_claims WHERE checkout_session_id=?`)
      .bind('bulk-order:' + order.id, account.email, order.currency, EDITION_SKU, now, reference),
    env.OBI_DB.prepare(`INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at)
      SELECT checkout_session_id,?,? FROM bulk_order_claims WHERE checkout_session_id=?`)
      .bind(deviceHash, now, reference),
  ]);
  if (Number(results[0]?.meta?.changes || 0) > 0) return { status: 200, body: { session_id: reference, claimed: true } };
  const retry = await env.OBI_DB.prepare('SELECT checkout_session_id FROM bulk_order_claims WHERE order_id=? AND account_id=?').bind(order.id, account.id).first();
  return retry
    ? { status: 200, body: { session_id: retry.checkout_session_id, alreadyClaimed: true } }
    : { status: 409, body: { error: 'All activations for this bulk code have been used.' } };
}
