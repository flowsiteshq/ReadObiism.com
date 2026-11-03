import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../dashboard-worker.js';

const call = (path, body = {}, env = {}) => worker.fetch(new Request('https://readobiism.com' + path, { method: 'POST', headers: { origin: 'https://readobiism.com', 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);

test('production bulk endpoints require sign-in instead of returning a blanket 503', async () => {
  for (const route of ['/api/bulk', '/api/bulk/verify', '/api/bulk/claim']) {
    const response = await call(route, { quantity: 20, provider: 'stripe', discount: { percentage: 99, confirmed: true, note: 'buyer selected' }, order_id: 'bprod_' + 'a'.repeat(32) });
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /sign in/i);
  }
});

test('signed bulk Paystack events fail without bulk storage', async () => {
  const secret = 'sk_test_local_fixture';
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'bpo_' + 'a'.repeat(32) } });
  const signature = createHmac('sha512', secret).update(body).digest('hex');
  const response = await worker.fetch(new Request('https://readobiism.com/api/paystack/webhook', { method: 'POST', headers: { 'x-paystack-signature': signature }, body }), { PAYSTACK_SECRET_KEY: secret });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'Bulk order storage is not configured.');
});

test('ordinary health and local-only bulk guards are unchanged', async () => {
  const health = await worker.fetch(new Request('https://readobiism.com/api/health'), {});
  assert.equal(health.status, 200);
  const localOnly = await call('/api/bulk/local/redeem');
  assert.equal(localOnly.status, 404);
});
