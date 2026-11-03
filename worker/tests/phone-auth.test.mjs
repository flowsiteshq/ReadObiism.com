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
