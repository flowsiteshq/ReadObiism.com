import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { handleAdminAuth } from '../api/src/admin-auth.js';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../database/migrations/0001_local_schema_baseline.sql', import.meta.url), 'utf8'));
  db.exec(`INSERT INTO obi_accounts VALUES ('acct_1','reader@example.test','private_password_hash','private_salt','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z');
    INSERT INTO purchases VALUES ('obi_reference','private_payment_id','reader@example.test',995,'usd','edition','active','2026-10-01T12:00:00Z');
    INSERT INTO reader_devices VALUES ('obi_reference','private_device_hash','2026-10-01T12:00:00Z');`);
  const env = { OBI_ADMIN_EMAIL: 'admin@example.test', OBI_ADMIN_PASSWORD: 'synthetic-strong-admin-password', OBI_DB: {
    exec: async (sql: string) => db.exec(sql),
    prepare: (sql: string) => ({ bind: (...values: any[]) => ({
      first: async () => db.prepare(sql).get(...values),
      run: async () => db.prepare(sql).run(...values),
      all: async () => ({ results: db.prepare(sql).all(...values) }),
    }), first: async () => db.prepare(sql).get() }),
  } };
  return { ...env, __testDb: db };
}
const request = (path: string, options: RequestInit = {}) => new Request('https://example.test/api/admin/' + path, options);
async function authenticate(env: any) {
  const response = await handleAdminAuth(request('login', { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: JSON.stringify({ email: env.OBI_ADMIN_EMAIL, password: env.OBI_ADMIN_PASSWORD }) }), env);
  return response.headers.get('set-cookie')!.split(';')[0];
}
describe('admin data views', () => {
  it('requires the separate administrator session for every data endpoint', async () => {
    const env = setup();
    for (const path of ['overview', 'readers', 'purchases', 'devices', 'gifts', 'content', 'transfers', 'payment-status']) {
      expect((await handleAdminAuth(request(path, { headers: { cookie: 'obiism_session=reader-token' } }), env)).status).toBe(401);
    }
  });
  it('reports payment configuration without exposing keys', async () => {
    const env = { ...setup(), PAYSTACK_SECRET_KEY: 'sk_test_secret_value', OBI_STRIPE_SECRET_KEY: 'sk_test_stripe_value', OBI_STRIPE_WEBHOOK_SECRET: 'whsec_secret_value' };
    const cookie = await authenticate(env);
    const response = await handleAdminAuth(request('payment-status', { headers: { cookie } }), env);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ paystack: { secretConfigured: true }, stripe: { secretConfigured: true, webhookConfigured: true } });
    expect(text).not.toMatch(/sk_test_|whsec_/);
  });
  it('shows gifts without revealing redeemable codes or private content and distinguishes unbound devices', async () => {
    const env = setup();
    env.__testDb.exec(`INSERT INTO purchases VALUES ('obi_giftref','secret_payment','buyer@example.test',995,'usd','edition','active','2026-10-01T12:00:00Z');
      INSERT INTO gift_orders VALUES ('OBI-ABCD-EFGH-JKLM','obi_giftref','buyer@example.test','Reader','reader@example.test','private message','active','2026-10-01T12:00:00Z',NULL);
      INSERT INTO reader_devices VALUES ('obi_giftref','UNBOUND','2026-10-01T12:00:00Z');
      INSERT INTO book_sections VALUES (1,'intro','INTRO','Introduction','chapter','["private manuscript"]');`);
    const cookie = await authenticate(env);
    const get = async (path: string) => (await handleAdminAuth(request(path, { headers: { cookie } }), env)).json();
    const overview = await get('overview');
    expect(overview.totals).toMatchObject({ gifts: 1, devices: 1 });
    const gifts = await get('gifts?q=buyer');
    expect(gifts.items[0]).toMatchObject({ recipient_email: 'reader@example.test', code_last4: 'JKLM', status: 'active' });
    expect(JSON.stringify(gifts)).not.toMatch(/OBI-ABCD-EFGH-JKLM|private message/);
    const devices = await get('devices?q=obi_giftref');
    expect(devices.items[0].binding_status).toBe('Awaiting activation');
    const content = await get('content?q=intro');
    expect(content.items[0].title).toBe('Introduction');
    expect(JSON.stringify(content)).not.toContain('private manuscript');
    const readers = await get('readers?q=reader');
    expect(readers.items[0].active_editions).toBe(1);
  });
  it('returns accurate counts and searchable records without private hashes', async () => {
    const env = setup(), cookie = await authenticate(env);
    const overview = await (await handleAdminAuth(request('overview', { headers: { cookie } }), env)).json();
    expect(overview.totals).toMatchObject({ readers: 1, purchases: 1, active_editions: 1, devices: 1 });
    for (const path of ['readers?q=reader', 'purchases?q=reference', 'devices?q=reference']) {
      const response = await handleAdminAuth(request(path, { headers: { cookie } }), env);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.total).toBe(1);
      expect(JSON.stringify(body)).not.toMatch(/private_password_hash|private_salt|private_device_hash|private_payment_id/);
    }
    const search = await (await handleAdminAuth(request('readers?q=%25'), { ...env })).json();
    expect(search.error).toBeDefined();
    const literal = await (await handleAdminAuth(request('readers?q=%25', { headers: { cookie } }), env)).json();
    expect(literal.total).toBe(0);
  });
});
