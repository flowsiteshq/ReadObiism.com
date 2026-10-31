import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

describe('local payment configuration endpoint', () => {
  it('requires an admin session and same-origin request, and never echoes secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obi-settings-proxy-'));
    const file = join(dir, '.dev.vars');
    await writeFile(file, 'OBI_ADMIN_EMAIL=admin@example.test\n');
    const worker = createServer((req, res) => {
      res.writeHead(req.url === '/api/admin/session' && req.headers.cookie === 'obi_admin_session=test' ? 200 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ authenticated: req.headers.cookie === 'obi_admin_session=test' }));
    });
    worker.listen(0, '127.0.0.1');
    await once(worker, 'listening');
    const workerPort = (worker.address() as { port: number }).port;
    const reserve = createServer();
    reserve.listen(0, '127.0.0.1');
    await once(reserve, 'listening');
    const port = (reserve.address() as { port: number }).port;
    await new Promise<void>((resolve) => reserve.close(() => resolve()));
    const child = spawn(process.execPath, [join(process.cwd(), 'scripts', 'dev-proxy.mjs')], { cwd: dir, env: { ...process.env, PORT: String(port), API_ORIGIN: `http://127.0.0.1:${workerPort}` }, stdio: 'ignore', windowsHide: true });
    const base = `http://127.0.0.1:${port}`, endpoint = base + '/api/admin/local-payment-settings';
    try {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        try { await fetch(base + '/missing'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
      }
      expect(ready).toBe(true);
      const send = (origin: string, cookie: string, key: string) => fetch(endpoint, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ PAYSTACK_SECRET_KEY: key }) });
      expect((await send('https://attacker.test', 'obi_admin_session=test', 'sk_test_samplevalue123')).status).toBe(403);
      expect((await send(base, '', 'sk_test_samplevalue123')).status).toBe(401);
      expect((await send(base, 'obi_admin_session=test', 'sk_live_samplevalue123')).status).toBe(400);
      expect(await readFile(file, 'utf8')).toBe('OBI_ADMIN_EMAIL=admin@example.test\n');
      const saved = await send(base, 'obi_admin_session=test', 'sk_test_samplevalue123');
      expect(saved.status).toBe(200);
      expect(await saved.text()).not.toContain('sk_test_samplevalue123');
      expect(await readFile(file, 'utf8')).toContain('PAYSTACK_SECRET_KEY=sk_test_samplevalue123');
    } finally {
      const exited = child.exitCode === null ? once(child, 'exit') : Promise.resolve();
      child.kill();
      await exited;
      await new Promise<void>((resolve) => worker.close(() => resolve()));
      await unlink(file);
      await rmdir(dir);
    }
  }, 15000);
});
