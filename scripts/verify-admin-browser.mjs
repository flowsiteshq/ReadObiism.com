// Local-only headless browser smoke check. Uses an isolated temporary profile.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const WebSocket = createRequire(import.meta.url)('ws');
const browser = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = 'http://127.0.0.1:5514';
const vars = Object.fromEntries((await readFile('.dev.vars', 'utf8')).split(/\r?\n/).filter((s) => s.includes('=')).map((s) => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: vars.OBI_ADMIN_EMAIL, password: vars.OBI_ADMIN_PASSWORD }) });
assert.equal(login.status, 200, 'local login');
const value = login.headers.get('set-cookie').split(';')[0].split('=')[1];
const profile = await mkdtemp(join(tmpdir(), 'obi-admin-browser-'));
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 80; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  assert.ok(port, 'headless browser started');
  const tab = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onclose = () => { for (const p of pending.values()) p.reject(new Error('Browser debugging connection closed')); pending.clear(); };
  socket.onerror = () => { for (const p of pending.values()) p.reject(new Error('Browser debugging connection failed')); pending.clear(); };
  socket.onmessage = (event) => { const msg = JSON.parse(String(event.data)); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
  await send('Network.enable');
  await send('Network.setCookie', { name: 'obi_admin_session', value, url: base + '/api/admin/', path: '/api/admin', httpOnly: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + '/admin/' });
  for (let i = 0; i < 80; i++) { if (await evaluate("document.readyState === 'complete' && !document.body.classList.contains('auth-pending') && document.querySelector('#stat-readers')?.textContent !== '—'")) break; await delay(100); }
  assert.equal(await evaluate("document.querySelector('#stat-readers').textContent !== '—' && !!window.Chart && !!Chart.getChart('reader-chart')"), true, 'dashboard charts and real counts');
  if (process.env.OBI_CAPTURE_ADMIN === '1') {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile('.wrangler/admin-preview.png', Buffer.from(shot.data, 'base64'));
  }
  await evaluate("document.querySelector('.menu-button').click()");
  assert.equal(await evaluate("document.querySelector('.menu-button').getAttribute('aria-expanded')"), 'false', 'desktop sidebar closes');
  await evaluate("document.querySelector('.menu-button').click()");
  assert.equal(await evaluate("document.querySelector('.menu-button').getAttribute('aria-expanded')"), 'true', 'desktop sidebar opens');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(200);
  await evaluate("document.querySelector('.menu-button').click()");
  assert.equal(await evaluate("document.querySelector('.menu-button').getAttribute('aria-expanded')"), 'true', 'mobile sidebar opens');
  await evaluate("document.querySelector('[data-section=readers]').click()");
  for (let i = 0; i < 40; i++) { if (await evaluate("!document.querySelector('#records').hidden && !document.querySelector('#table-message').textContent.includes('Loading')")) break; await delay(100); }
  assert.equal(await evaluate("document.querySelector('.menu-button').getAttribute('aria-expanded') === 'false' && document.querySelector('#table-body tr') !== null"), true, 'mobile navigation and reader table');
  await evaluate("document.querySelector('[data-section=gifts]').click()");
  for (let i = 0; i < 40; i++) { if (await evaluate("document.querySelector('#records-heading').textContent === 'Gifts & codes' && !document.querySelector('#table-message').textContent.includes('Loading')")) break; await delay(100); }
  assert.equal(await evaluate("document.querySelector('#records-heading').textContent === 'Gifts & codes' && !document.querySelector('#table-message').textContent.includes('Could not')"), true, 'gift view');
  await evaluate("document.querySelector('.menu-button').click(); document.querySelector('[data-section=payments]').click()");
  for (let i = 0; i < 40; i++) { if (await evaluate("!document.querySelector('#payment-settings').hidden && document.querySelector('#paystack-status').textContent !== 'Checking…'")) break; await delay(100); }
  assert.equal(await evaluate("!document.querySelector('#payment-settings').hidden && !document.querySelector('#local-payment-panel').hidden && !!document.querySelector('#paystack-key') && document.querySelector('#paystack-status').textContent !== 'Unavailable'"), true, 'local payment settings');
  console.log('Desktop and mobile navigation, charts, records and payment settings passed.');
} finally {
  socket?.close(); child.kill();
  await fetch(base + '/api/admin/logout', { method: 'POST', headers: { origin: base, cookie: 'obi_admin_session=' + value } });
}
