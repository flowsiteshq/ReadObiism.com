import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { hashDeviceToken } from '../api/src/security.js';

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

async function seed(env) {
  const db = env.OBI_DB;
  const sessionId = 'obi_' + 'c'.repeat(16);
  const deviceToken = 'd'.repeat(48);
  const deviceHash = await hashDeviceToken(deviceToken);
  const now = new Date().toISOString();
  db.raw.exec(`CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL, metadata_json TEXT);`);
  db.raw.prepare('INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(sessionId, null, 'reader@example.test', 700000, 'NGN', 'obi_ism_complete_edition', 'active', now);
  db.raw.prepare('INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)')
    .run(sessionId, deviceHash, now);
  return { sessionId, deviceToken };
}

const post = (body) => new Request('https://readobiism.com/api/reader/feedback', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('only an active, device-bound reader can submit and update feedback', async () => {
  const db = database();
  const env = { OBI_DB: db };
  const { sessionId, deviceToken } = await seed(env);

  const saved = await worker.fetch(post({ session_id: sessionId, device_token: deviceToken, rating: 5, comment: 'A thoughtful and beautifully presented edition.' }), env);
  assert.equal(saved.status, 200, await saved.clone().text());
  const savedBody = await saved.json();
  assert.equal(savedBody.saved, true);
  assert.equal(savedBody.feedback.rating, 5);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM book_feedback').get().n, 1);

  const updated = await worker.fetch(post({ session_id: sessionId, device_token: deviceToken, rating: 4, comment: 'Still excellent on a second read.' }), env);
  assert.equal(updated.status, 200, await updated.clone().text());
  assert.equal((await updated.json()).feedback.rating, 4);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM book_feedback').get().n, 1);

  const read = await worker.fetch(new Request(`https://readobiism.com/api/reader/feedback?session_id=${encodeURIComponent(sessionId)}`, {
    headers: { 'x-obi-device-token': deviceToken },
  }), env);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.feedback.rating, 4);
  assert.equal(readBody.feedback.comment, 'Still excellent on a second read.');

  const wrongDevice = await worker.fetch(post({ session_id: sessionId, device_token: 'e'.repeat(48), rating: 5, comment: 'Not allowed.' }), env);
  assert.equal(wrongDevice.status, 403);

  const invalid = await worker.fetch(post({ session_id: sessionId, device_token: deviceToken, rating: 9, comment: '' }), env);
  assert.equal(invalid.status, 400);
});
