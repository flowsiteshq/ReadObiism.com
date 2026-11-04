import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';

function database() {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
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
  };
}

const request = (path, init = {}) => new Request(`https://readobiism.com${path}`, init);

test('feature flags default device transfers off and can be toggled by an admin', async () => {
  const db = database();
  const env = {
    OBI_DB: db,
    OBI_ADMIN_EMAIL: 'admin@example.test',
    OBI_ADMIN_PASSWORD: 'a'.repeat(32),
  };

  const publicBefore = await worker.fetch(request('/api/features'), env);
  assert.equal(publicBefore.status, 200);
  const before = await publicBefore.json();
  assert.equal(before.features.device_transfer, false);
  assert.equal(before.features.bulk_purchase, true);

  const login = await worker.fetch(request('/api/admin/login', {
    method: 'POST',
    headers: { origin: 'https://readobiism.com', 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.OBI_ADMIN_EMAIL, password: env.OBI_ADMIN_PASSWORD }),
  }), env);
  assert.equal(login.status, 200);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

  const adminBefore = await worker.fetch(request('/api/admin/features', { headers: { cookie } }), env);
  assert.equal(adminBefore.status, 200);
  const adminFeatures = (await adminBefore.json()).features;
  assert.equal(adminFeatures.find((feature) => feature.key === 'device_transfer').enabled, false);

  const update = await worker.fetch(request('/api/admin/features', {
    method: 'POST',
    headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', cookie },
    body: JSON.stringify({ key: 'device_transfer', enabled: true }),
  }), env);
  assert.equal(update.status, 200, await update.clone().text());

  const publicAfter = await worker.fetch(request('/api/features'), env);
  const after = await publicAfter.json();
  assert.equal(after.features.device_transfer, true);
});
