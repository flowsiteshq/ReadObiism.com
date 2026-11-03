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

const tokenInfo = (overrides = {}) => ({
  aud: 'test-client',
  iss: 'https://accounts.google.com',
  email: 'google-reader@example.test',
  email_verified: 'true',
  sub: 'google-subject-1',
  exp: String(Math.floor(Date.now() / 1000) + 3600),
  ...overrides,
});

const request = () => new Request('https://readobiism.com/api/account/google', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ credential: 'x'.repeat(120) }),
});

test('Google sign-in creates a verified account and is idempotent', async () => {
  const db = database();
  const env = { OBI_DB: db, GOOGLE_CLIENT_ID: 'test-client' };
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /oauth2\.googleapis\.com\/tokeninfo/);
    return Response.json(tokenInfo());
  };
  try {
    const first = await worker.fetch(request(), env);
    assert.equal(first.status, 200, await first.clone().text());
    const firstBody = await first.json();
    assert.equal(firstBody.account.email, 'google-reader@example.test');
    assert.equal(firstBody.account.email_verified, true);
    assert.equal(firstBody.provider, 'google');
    assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_accounts').get().n, 1);
    assert.equal(db.raw.prepare("SELECT google_sub FROM obi_accounts WHERE email='google-reader@example.test'").get().google_sub, 'google-subject-1');

    const second = await worker.fetch(request(), env);
    assert.equal(second.status, 200);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_accounts').get().n, 1);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_account_sessions').get().n, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('Google sign-in rejects a token for another client', async () => {
  const db = database();
  const env = { OBI_DB: db, GOOGLE_CLIENT_ID: 'test-client' };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(tokenInfo({ aud: 'other-client' }));
  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 401);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_accounts').get().n, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('Google sign-in fails closed when not configured', async () => {
  const db = database();
  const env = { OBI_DB: db };
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 503);
});
