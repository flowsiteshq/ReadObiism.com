import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { EDITION_SKU } from '../api/src/pricing.js';

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

const post = (path, body) => new Request(`https://readobiism.com${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('phone accounts can register, sign in and read their identity', async () => {
  const db = database();
  const env = { OBI_DB: db };
  const registered = await worker.fetch(post('/api/account/phone/register', { phone: '08012345678', password: 'example-password-123' }), env);
  assert.equal(registered.status, 200, await registered.clone().text());
  const registeredBody = await registered.json();
  assert.equal(registeredBody.account.phone, '+2348012345678');
  assert.match(registeredBody.account.email, /^phone_[a-f0-9]+@phone\.obiism\.local$/);
  assert.ok(registeredBody.token);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_accounts').get().n, 1);

  const duplicate = await worker.fetch(post('/api/account/phone/register', { phone: '+2348012345678', password: 'another-password-123' }), env);
  assert.equal(duplicate.status, 409);

  const login = await worker.fetch(post('/api/account/phone/login', { phone: '08012345678', password: 'example-password-123' }), env);
  assert.equal(login.status, 200, await login.clone().text());
  assert.equal((await login.json()).account.phone, '+2348012345678');

  const wrong = await worker.fetch(post('/api/account/phone/login', { phone: '+2348012345678', password: 'wrong-password-123' }), env);
  assert.equal(wrong.status, 401);

  const access = await worker.fetch(new Request('https://readobiism.com/api/account/access', {
    headers: { authorization: `Bearer ${registeredBody.token}` },
  }), env);
  assert.equal(access.status, 200);
  const accessBody = await access.json();
  assert.equal(accessBody.authenticated, true);
  assert.equal(accessBody.phone, '+2348012345678');
});

test('phone buyer can pay for a single edition with a real receipt email', async () => {
  const db = database();
  const env = {
    OBI_DB: db,
    BULK_CODE_ENCRYPTION_KEY: 'c7'.repeat(32),
    PAYSTACK_SECRET_KEY: 'sk_test_fixture',
    OBI_PUBLIC_APP_URL: 'https://readobiism.com',
  };
  const registered = await worker.fetch(post('/api/account/phone/register', {
    phone: '08012345678',
    password: 'example-password-123',
  }), env);
  const { token } = await registered.json();
  assert.ok(token);

  let initializeBody = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/transaction\/initialize$/);
    initializeBody = JSON.parse(options.body);
    return Response.json({
      status: true,
      data: {
        authorization_url: 'https://checkout.paystack.com/single-test',
        reference: initializeBody.reference,
      },
    });
  };
  try {
    const response = await worker.fetch(new Request('https://readobiism.com/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://readobiism.com',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: 'buyer@example.test',
        device_token: 'd'.repeat(48),
        currency: 'NGN',
      }),
    }), env);
    assert.equal(response.status, 200, await response.clone().text());
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(initializeBody.email, 'buyer@example.test');
  assert.match(initializeBody.metadata.purchaser_email, /^phone_[a-f0-9]+@phone\.obiism\.local$/);
  assert.equal(initializeBody.metadata.receipt_email, 'buyer@example.test');
});

test('phone buyer uses a real receipt email without changing the login identity', async () => {
  const db = database();
  const env = {
    OBI_DB: db,
    BULK_CODE_ENCRYPTION_KEY: 'c7'.repeat(32),
    PAYSTACK_SECRET_KEY: 'sk_test_fixture',
    OBI_PUBLIC_APP_URL: 'https://readobiism.com',
  };
  const registered = await worker.fetch(post('/api/account/phone/register', {
    phone: '08012345678',
    password: 'example-password-123',
  }), env);
  const { token } = await registered.json();
  assert.ok(token);

  let initializeBody = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/transaction\/initialize$/);
    initializeBody = JSON.parse(options.body);
    return Response.json({
      status: true,
      data: {
        authorization_url: 'https://checkout.paystack.com/test-checkout',
        reference: initializeBody.reference,
      },
    });
  };
  try {
    const response = await worker.fetch(new Request('https://readobiism.com/api/bulk', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://readobiism.com',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: 'buyer@example.test', quantity: 2, provider: 'paystack' }),
    }), env);
    assert.equal(response.status, 201, await response.clone().text());
  } finally {
    globalThis.fetch = originalFetch;
  }

  const order = db.raw.prepare('SELECT id,buyer_email,buyer_account_id,receipt_email,quantity,total_minor,provider_reference FROM bulk_orders').get();
  assert.match(order.buyer_email, /^phone_[a-f0-9]+@phone\.obiism\.local$/);
  assert.equal(order.receipt_email, 'buyer@example.test');
  assert.ok(order.buyer_account_id);
  assert.equal(initializeBody.email, 'buyer@example.test');
  assert.equal(initializeBody.metadata.purchaser_email, order.buyer_email);
  assert.equal(initializeBody.metadata.receipt_email, 'buyer@example.test');

  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/transaction\/verify\//);
    return Response.json({
      status: true,
      data: {
        status: 'success',
        domain: 'test',
        reference: order.provider_reference,
        currency: 'NGN',
        amount: order.total_minor,
        customer: { email: 'buyer@example.test' },
        metadata: {
          bulk_order_id: order.id,
          quantity: order.quantity,
          product_sku: EDITION_SKU,
        },
      },
    });
  };
  try {
    const verified = await worker.fetch(new Request('https://readobiism.com/api/bulk/verify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ order_id: order.id }),
    }), env);
    assert.equal(verified.status, 200, await verified.clone().text());
    const body = await verified.json();
    assert.equal(body.status, 'paid');
    assert.match(body.code, /^OBI-BULK-[A-F0-9]{48}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
