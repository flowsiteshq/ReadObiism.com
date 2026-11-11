import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { getPricing, savePricing, validatePricing } from '../api/src/pricing-store.js';

function database() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    exec: async (sql) => raw.exec(sql),
    prepare(sql) {
      const api = {
        sql,
        args: [],
        bind(...args) { api.args = args; return api; },
        first: async () => raw.prepare(sql).get(...api.args) || null,
        all: async () => ({ results: raw.prepare(sql).all(...api.args) }),
        run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...api.args).changes) } }),
      };
      return api;
    },
    batch: async (statements) => {
      raw.exec('BEGIN');
      try {
        const result = statements.map((statement) => ({
          meta: { changes: Number(raw.prepare(statement.sql).run(...statement.args).changes) },
        }));
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    raw,
  };
  return db;
}

const request = (path, init = {}) => new Request(`https://readobiism.com${path}`, init);

test('public pricing uses the compiled defaults before an admin change', async () => {
  const db = database();
  const response = await worker.fetch(request('/api/pricing'), { OBI_DB: db });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.NGN.amount, 6995);
  assert.equal(body.NGN.formatted, '₦6,995');
  assert.equal(body.USD.amount, 9.95);
  assert.equal(body.USD.formatted, '$9.95');
});

test('pricing validation rejects fractional naira and sub-cent dollars', () => {
  assert.equal(validatePricing({ ngn: 6995, usd: 9.95 }).ok, true);
  assert.equal(validatePricing({ ngn: 6995.5, usd: 9.95 }).ok, false);
  assert.equal(validatePricing({ ngn: 0, usd: 9.95 }).ok, false);
  assert.equal(validatePricing({ ngn: 6995, usd: 9.999 }).ok, false);
});

test('saved prices are returned by the public endpoint', async () => {
  const db = database();
  const env = { OBI_DB: db };
  const saved = await savePricing(env, { ngnMinor: 750000, usdMinor: 1200 }, 'admin@example.test');
  assert.equal(saved.NGN.amount, 7500);
  assert.equal(saved.USD.amount, 12);
  const response = await worker.fetch(request('/api/pricing'), env);
  const body = await response.json();
  assert.equal(body.NGN.amount, 7500);
  assert.equal(body.NGN.formatted, '₦7,500');
  assert.equal(body.USD.formatted, '$12.00');
});

test('admin session can read and update the live prices', async () => {
  const db = database();
  const env = {
    OBI_DB: db,
    OBI_ADMIN_EMAIL: 'admin@example.test',
    OBI_ADMIN_PASSWORD: 'a'.repeat(32),
  };
  const login = await worker.fetch(request('/api/admin/login', {
    method: 'POST',
    headers: { origin: 'https://readobiism.com', 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.OBI_ADMIN_EMAIL, password: env.OBI_ADMIN_PASSWORD }),
  }), env);
  assert.equal(login.status, 200);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^obi_admin_session=/);

  const current = await worker.fetch(request('/api/admin/pricing', { headers: { cookie } }), env);
  assert.equal(current.status, 200);
  assert.equal((await current.json()).pricing.NGN.amount, 6995);

  const update = await worker.fetch(request('/api/admin/pricing', {
    method: 'POST',
    headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', cookie },
    body: JSON.stringify({ ngn: 8000, usd: 11.5 }),
  }), env);
  assert.equal(update.status, 200);
  const updated = await update.json();
  assert.equal(updated.pricing.NGN.amount, 8000);
  assert.equal(updated.pricing.USD.amount, 11.5);

  const publicResponse = await worker.fetch(request('/api/pricing'), env);
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.NGN.amount, 8000);
  assert.equal(publicBody.NGN.formatted, '₦8,000');
  assert.equal(publicBody.USD.formatted, '$11.50');
});

test('new checkouts quote the saved price', async () => {
  const db = database();
  const env = { OBI_DB: db, PAYSTACK_SECRET_KEY: 'sk_test_fixture' };
  await savePricing(env, { ngnMinor: 800000, usdMinor: 1150 }, 'admin@example.test');
  const registration = await worker.fetch(request('/api/account/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({email:'buyer@example.test',password:'buyer-password-123'}) }), env);
  assert.equal(registration.status, 200, await registration.clone().text());
  const token = (await registration.json()).token;
  assert.ok(token);
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
    return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/test' } });
  };
  try {
    const response = await worker.fetch(request('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'buyer@example.test', device_token: 'a'.repeat(32), currency: 'NGN', quoted_total_minor: 822000 }),
    }), env);
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.amount, 8220);
    const payment = JSON.parse(calls[0].body);
    assert.equal(payment.amount, 822000);
    assert.equal(payment.metadata.price_minor, '822000');
    assert.equal(payment.metadata.subtotal_minor, '800000');
    assert.equal(payment.metadata.processing_fee_minor, '22000');
  } finally {
    globalThis.fetch = original;
  }
});

test('getPricing does not leak a stale value after an invalid stored row', async () => {
  const db = database();
  const env = { OBI_DB: db };
  await savePricing(env, { ngnMinor: 750000, usdMinor: 1200 }, 'admin@example.test');
  db.raw.prepare("UPDATE site_settings SET value='not-a-number' WHERE key='price_ngn_minor'").run();
  const pricing = await getPricing(env);
  assert.equal(pricing.NGN.amount, 6995);
  assert.equal(pricing.USD.amount, 12);
});

test('Paystack quote is checked before starting checkout and old prices are rejected', async () => {
  const db = database(), env = { OBI_DB: db, PAYSTACK_SECRET_KEY: 'sk_test_fixture' };
  const reg = await worker.fetch(request('/api/account/register', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:'quote@example.test',password:'quote-password-123'}) }),env);
  const token = (await reg.json()).token;
  const quoteResponse = await worker.fetch(request('/api/paystack/quote?quantity=1'),env);
  const quote = await quoteResponse.json();
  assert.equal(quote.subtotal_minor,699500); assert.equal(quote.fee_minor,20493); assert.equal(quote.total_minor,719993);
  const bulkQuote = await (await worker.fetch(request('/api/paystack/quote?quantity=20'),env)).json();
  assert.equal(bulkQuote.subtotal_minor,13990000); assert.equal(bulkQuote.fee_minor,200000); assert.equal(bulkQuote.total_minor,14190000);
  let providerCalls = 0; const previous = globalThis.fetch; globalThis.fetch = async()=>{providerCalls++; throw Error('Should not call provider');};
  try {
    const stale = await worker.fetch(request('/api/checkout',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({email:'quote@example.test',device_token:'x'.repeat(48),currency:'NGN',quoted_total_minor:699500})}),env);
    assert.equal(stale.status,409); assert.equal((await stale.json()).code,'price_changed'); assert.equal(providerCalls,0);
  } finally { globalThis.fetch=previous; }
});
