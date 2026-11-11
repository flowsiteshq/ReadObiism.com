import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';

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

const post = (path, body, token = '', { origin = true } = {}) => new Request(`https://readobiism.com${path}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(origin ? { origin: 'https://readobiism.com' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

const testEnv = (db) => ({
  OBI_DB: db,
  BULK_CODE_ENCRYPTION_KEY: 'c7'.repeat(32),
  PAYSTACK_SECRET_KEY: 'sk_test_fixture',
  OBI_PUBLIC_APP_URL: 'https://readobiism.com',
});

async function phoneAccount(env, phone) {
  const response = await worker.fetch(post('/api/account/phone/register', {
    phone,
    password: 'example-password-123',
  }, '', { origin: false }), env);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

function addActiveEdition(db, sessionId, email) {
  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  db.raw.prepare(
    `INSERT INTO purchases
      (checkout_session_id,payment_intent_id,purchaser_email,reader_name,amount_cents,currency,product_sku,status,granted_at,expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sessionId,
    null,
    email,
    'Reader',
    699500,
    'NGN',
    'obi_ism_complete_edition',
    'active',
    now.toISOString(),
    expires.toISOString(),
  );
}

function paystackMock(counter) {
  return async (url, options) => {
    counter.calls += 1;
    assert.match(String(url), /\/transaction\/initialize$/);
    const body = JSON.parse(options.body);
    return Response.json({
      status: true,
      data: {
        authorization_url: 'https://checkout.paystack.com/duplicate-warning-test',
        reference: body.reference,
      },
    });
  };
}

test('repeat self-purchase warns before Paystack and requires confirmation', async () => {
  const db = database();
  const env = testEnv(db);
  const registered = await phoneAccount(env, '08012345678');
  assert.ok(registered.token, 'phone registration should return a session token');
  assert.ok(registered.account?.email, 'phone account should expose its internal email');
  addActiveEdition(db, 'obi_aaaaaaaaaaaaaaaa', registered.account.email);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM purchases').get().n, 1);
  const access = await worker.fetch(new Request('https://readobiism.com/api/account/access', {
    headers: { authorization: `Bearer ${registered.token}` },
  }), env);
  const accessBody = await access.json();
  assert.equal(accessBody.authenticated, true, JSON.stringify(accessBody));
  assert.equal(accessBody.access, true, JSON.stringify(accessBody));

  const originalFetch = globalThis.fetch;
  const counter = { calls: 0 };
  globalThis.fetch = async () => {
    counter.calls += 1;
    throw new Error('payment must not start before the buyer confirms');
  };
  try {
    const warning = await worker.fetch(post('/api/checkout', {
      email: 'buyer@example.test',
      device_token: 'd'.repeat(48),
      currency: 'NGN',
      quoted_total_minor: 719993,
    }, registered.token), env);
    assert.equal(warning.status, 409, await warning.clone().text());
    const body = await warning.json();
    assert.equal(body.code, 'existing_edition');
    assert.equal(body.requires_confirmation, true);
    assert.match(body.warning, /already have an active edition/);
    assert.match(body.warning, /fresh 365-day term/);
    assert.match(body.warning, /not be extended or replaced/);
    assert.equal(counter.calls, 0, 'Paystack must not be called before confirmation');

    globalThis.fetch = paystackMock(counter);
    const confirmed = await worker.fetch(post('/api/checkout', {
      email: 'buyer@example.test',
      device_token: 'd'.repeat(48),
      currency: 'NGN',
      quoted_total_minor: 719993,
      confirm_duplicate: true,
    }, registered.token), env);
    assert.equal(confirmed.status, 200, await confirmed.clone().text());
    assert.equal(counter.calls, 1, 'confirmed checkout should reach Paystack once');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USD repeat purchase warns before Stripe and requires confirmation', async () => {
  const db = database();
  const env = { ...testEnv(db), OBI_STRIPE_SECRET_KEY: 'sk_test_fixture' };
  const registered = await phoneAccount(env, '08011112222');
  addActiveEdition(db, 'obi_cccccccccccccccc', registered.account.email);

  const originalFetch = globalThis.fetch;
  const counter = { calls: 0 };
  globalThis.fetch = async () => {
    counter.calls += 1;
    throw new Error('Stripe must not start before the buyer confirms');
  };
  try {
    const warning = await worker.fetch(post('/api/checkout', {
      email: 'buyer@example.test',
      device_token: 'f'.repeat(48),
      currency: 'USD',
    }, registered.token), env);
    assert.equal(warning.status, 409, await warning.clone().text());
    const body = await warning.json();
    assert.equal(body.code, 'existing_edition');
    assert.equal(body.requires_confirmation, true);
    assert.equal(counter.calls, 0, 'Stripe must not be called before confirmation');

    globalThis.fetch = async (url, options) => {
      counter.calls += 1;
      assert.match(String(url), /api\.stripe\.com\/v1\/checkout\/sessions$/);
      assert.equal(options.method, 'POST');
      return Response.json({
        id: 'cs_test_1234567890abcdef',
        url: 'https://checkout.stripe.com/c/pay/test',
      });
    };
    const confirmed = await worker.fetch(post('/api/checkout', {
      email: 'buyer@example.test',
      device_token: 'f'.repeat(48),
      currency: 'USD',
      confirm_duplicate: true,
    }, registered.token), env);
    assert.equal(confirmed.status, 200, await confirmed.clone().text());
    assert.equal(counter.calls, 1, 'confirmed Stripe checkout should reach Stripe once');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('gift buyer is warned when the recipient already has an active edition', async () => {
  const db = database();
  const env = testEnv(db);
  const registered = await phoneAccount(env, '08087654321');
  addActiveEdition(db, 'obi_bbbbbbbbbbbbbbbb', 'friend@example.test');

  const originalFetch = globalThis.fetch;
  const counter = { calls: 0 };
  globalThis.fetch = async () => {
    counter.calls += 1;
    throw new Error('payment must not start before the buyer confirms');
  };
  try {
    const gift = {
      email: 'buyer@example.test',
      device_token: 'e'.repeat(48),
      currency: 'NGN',
      quoted_total_minor: 719993,
      gift: true,
      gift_code: 'OBI-7K2M-P9QX-4HWD',
      recipient_name: 'Friend',
      recipient_email: 'friend@example.test',
      gift_message: '',
    };
    const warning = await worker.fetch(post('/api/checkout', gift, registered.token), env);
    assert.equal(warning.status, 409, await warning.clone().text());
    const body = await warning.json();
    assert.equal(body.code, 'existing_edition');
    assert.equal(body.requires_confirmation, true);
    assert.match(body.warning, /This person already has an active edition/);
    assert.match(body.warning, /fresh 365-day term for them|for them with a fresh 365-day term/);
    assert.match(body.warning, /not be extended or replaced/);
    assert.equal(counter.calls, 0, 'Paystack must not be called before confirmation');

    globalThis.fetch = paystackMock(counter);
    const confirmed = await worker.fetch(post('/api/checkout', {
      ...gift,
      confirm_duplicate: true,
    }, registered.token), env);
    assert.equal(confirmed.status, 200, await confirmed.clone().text());
    assert.equal(counter.calls, 1, 'confirmed gift checkout should reach Paystack once');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
