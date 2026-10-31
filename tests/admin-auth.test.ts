import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { handleAdminAuth } from '../api/src/admin-auth.js';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function environment() {
  const db = new DatabaseSync(':memory:');
  return {
    OBI_ADMIN_EMAIL: 'admin@example.test',
    OBI_ADMIN_PASSWORD: 'synthetic-strong-admin-password',
    OBI_DB: {
      exec: async (sql: string) => db.exec(sql),
      prepare: (sql: string) => ({ bind: (...values: any[]) => ({
        first: async () => db.prepare(sql).get(...values),
        run: async () => db.prepare(sql).run(...values),
      }) }),
    },
  };
}
function req(path: string, options: RequestInit = {}) { return new Request(`https://example.test/api/admin/${path}`, options); }
const login = (email = 'admin@example.test', password = 'synthetic-strong-admin-password', origin = 'https://example.test') => req('login', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1' }, body: JSON.stringify({ email, password }) });

describe('separate admin authentication', () => {
  it('rejects missing configuration, cross-origin requests, wrong credentials and reader cookies', async () => {
    const env = environment();
    expect((await handleAdminAuth(login(), { ...env, OBI_ADMIN_PASSWORD: '' })).status).toBe(503);
    expect((await handleAdminAuth(login(undefined, undefined, 'https://attacker.test'), env)).status).toBe(403);
    expect((await handleAdminAuth(login('admin@example.test', 'incorrect'), env)).status).toBe(401);
    expect((await handleAdminAuth(req('session', { headers: { cookie: 'obiism_session=reader-token' } }), env)).status).toBe(401);
  });
  it('issues a separate secure session and revokes it at logout', async () => {
    const env = environment();
    const response = await handleAdminAuth(login(), env);
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    const header = cookie.split(';')[0];
    expect((await handleAdminAuth(req('session', { headers: { cookie: header } }), env)).status).toBe(200);
    expect((await handleAdminAuth(req('logout', { method: 'POST', headers: { cookie: header, origin: 'https://example.test' } }), env)).status).toBe(200);
    expect((await handleAdminAuth(req('session', { headers: { cookie: header } }), env)).status).toBe(401);
  });
  it('limits repeated attempts', async () => {
    const env = environment();
    for (let i = 0; i < 10; i++) expect((await handleAdminAuth(login('admin@example.test', 'incorrect'), env)).status).toBe(401);
    expect((await handleAdminAuth(login(), env)).status).toBe(429);
  });
});
