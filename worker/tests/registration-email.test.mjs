import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { verificationEmail } from '../api/src/email-templates.js';

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

const register = (email) => new Request('https://readobiism.com/api/account/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'example-password-123' }),
});

test('registration sends a verification email when Resend is configured', async () => {
  const db = database();
  const env = {
    OBI_DB: db,
    RESEND_API_KEY: 're_fixture',
    ACCOUNT_FROM_EMAIL: 'OBI-ISM <no-reply@example.test>',
  };
  let sent = null;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init.body) };
    return Response.json({ id: 'email_test' });
  };
  try {
    const response = await worker.fetch(register('new-reader@example.test'), env);
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.verification_sent, true);
    assert.equal(sent.url, 'https://api.resend.com/emails');
    assert.deepEqual(sent.body.to, ['new-reader@example.test']);
    assert.equal(sent.body.from, 'OBI-ISM <no-reply@example.test>');
    assert.equal(sent.body.reply_to, 'sensei30002003@gmail.com');
    assert.equal(sent.body.subject, 'Your OBI-ISM verification code');
    assert.match(sent.body.text, /\d{8}/);
    assert.match(sent.body.text, /\/verify-email/);
    assert.match(sent.body.html, /\d{8}/);
    assert.match(sent.body.html, /\/verify-email/);
    assert.match(sent.body.html, /OBI–/);
    assert.deepEqual(sent.body.tags, [{ name: 'type', value: 'account-verification' }]);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM account_verification_challenges').get().n, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('registration still succeeds when email is not configured', async () => {
  const db = database();
  const env = { OBI_DB: db };
  const response = await worker.fetch(register('no-email-config@example.test'), env);
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.verification_sent, false);
  assert.equal(body.account.email, 'no-email-config@example.test');
  assert.equal(db.raw.prepare('SELECT count(*) n FROM account_verification_challenges').get().n, 0);
});
