// Exercises only the local admin test identity; never prints the credentials.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const port = process.env.OBI_LOCAL_PREVIEW_PORT || '5515';
if (!/^\d{1,5}$/.test(port)) throw new Error('Expected a local preview port');
const base = `http://127.0.0.1:${port}`;
const values = Object.fromEntries((await readFile('.dev.vars', 'utf8')).split(/\r?\n/).filter((line) => line.includes('=')).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: values.OBI_ADMIN_EMAIL, password: values.OBI_ADMIN_PASSWORD }) });
assert.equal(response.status, 200, 'login');
const cookie = response.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie, 'session cookie');
assert.equal((await fetch(`${base}/api/admin/session`, { headers: { cookie } })).status, 200, 'session');
for (const path of ['overview', 'readers', 'purchases', 'devices', 'gifts', 'content', 'transfers']) {
  assert.equal((await fetch(`${base}/api/admin/${path}`)).status, 401, `${path} requires admin`);
  const data = await fetch(`${base}/api/admin/${path}`, { headers: { cookie } });
  assert.equal(data.status, 200, `${path} loads`);
  const body = await data.json();
  assert.ok(path === 'overview' ? body.totals : Array.isArray(body.items), `${path} data shape`);
}
assert.equal((await fetch(`${base}/api/admin/logout`, { method: 'POST', headers: { origin: base, cookie } })).status, 200, 'logout');
assert.equal((await fetch(`${base}/api/admin/session`, { headers: { cookie } })).status, 401, 'revoked session');
assert.equal((await fetch(`${base}/admin/admin.css`)).status, 200, 'stylesheet');
assert.equal((await fetch(`${base}/admin/vendor/chart.umd.min.js`)).status, 200, 'chart library');
assert.equal((await fetch(`${base}/admin`, { redirect: 'manual' })).status, 308, 'directory redirect');
console.log('Local admin login, session, logout, stylesheet and directory redirect passed.');
