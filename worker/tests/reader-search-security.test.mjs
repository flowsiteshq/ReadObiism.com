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
  const sessionId = 'obi_' + 'f'.repeat(16);
  const deviceToken = 'g'.repeat(48);
  const deviceHash = await hashDeviceToken(deviceToken);
  const now = new Date().toISOString();
  db.raw.exec(`CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, reader_name TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL, metadata_json TEXT);
    CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL);`);
  db.raw.prepare('INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,reader_name,amount_cents,currency,product_sku,status,granted_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(sessionId, null, 'reader@example.test', 'A Reader', 700000, 'NGN', 'obi_ism_complete_edition', 'active', now);
  db.raw.prepare('INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)')
    .run(sessionId, deviceHash, now);
  db.raw.prepare('INSERT INTO book_sections (position,section_id,label,title,kind,paragraphs_json) VALUES (?,?,?,?,?,?)')
    .run(1, 'chapter-one', 'CHAPTER 01', 'Character builds nations', 'chapter', JSON.stringify(['A paragraph.']));
  return { sessionId, deviceToken };
}


const request = (sessionId, deviceToken, q='paragraph') => new Request('https://readobiism.com/api/reader/search?session_id=' + encodeURIComponent(sessionId) + '&q=' + encodeURIComponent(q), { headers: { 'x-obi-device-token': deviceToken } });

test('search returns matching content for the licensed device', async () => {
 const db=database(),env={OBI_DB:db};const {sessionId,deviceToken}=await seed(env);
 const response=await worker.fetch(request(sessionId,deviceToken),env);
 assert.equal(response.status,200,await response.clone().text());
 const data=await response.json();assert.equal(data.matches.length,1);assert.equal(data.matches[0].section_id,'chapter-one');
});
test('search rejects another device before indexing protected content', async () => {
 const db=database(),env={OBI_DB:db};const {sessionId}=await seed(env);
 const response=await worker.fetch(request(sessionId,'h'.repeat(48)),env);
 assert.equal(response.status,403);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM search_index').get().n,0);
});
test('search rejects missing purchase and expired access', async () => {
 const db=database(),env={OBI_DB:db};const {sessionId,deviceToken}=await seed(env);
 let response=await worker.fetch(request('obi_'+'e'.repeat(16),deviceToken),env);assert.equal(response.status,403);
 await worker.fetch(request(sessionId,'h'.repeat(48)),env);
 db.raw.prepare('UPDATE purchases SET expires_at=? WHERE checkout_session_id=?').run('2020-01-01T00:00:00.000Z',sessionId);
 response=await worker.fetch(request(sessionId,deviceToken),env);assert.equal(response.status,403);
});
