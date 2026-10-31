import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateLocalPaymentSecrets, validatePaymentSecrets } from '../scripts/local-payment-settings.mjs';

describe('local payment test secrets', () => {
  it('rejects live keys, public keys, unknown names and injected lines', () => {
    for (const input of [
      {}, { PAYSTACK_SECRET_KEY: 'sk_live_12345678901234' },
      { PAYSTACK_SECRET_KEY: 'pk_test_12345678901234' },
      { OTHER: 'sk_test_12345678901234' },
      { PAYSTACK_SECRET_KEY: 'sk_test_12345678901234\nOBI_ADMIN_EMAIL=attacker' },
    ]) expect(() => validatePaymentSecrets(input)).toThrow();
  });
  it('updates only selected fields and preserves unrelated settings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obi-payment-test-')), file = join(dir, '.dev.vars');
    try {
      await writeFile(file, '# local config\nOBI_ADMIN_EMAIL=admin@example.test\nPAYSTACK_SECRET_KEY=sk_test_original123\n');
      await updateLocalPaymentSecrets(file, { PAYSTACK_SECRET_KEY: 'sk_test_replacement123', OBI_STRIPE_SECRET_KEY: 'sk_test_stripe123456' });
      const saved = await readFile(file, 'utf8');
      expect(saved).toContain('# local config\nOBI_ADMIN_EMAIL=admin@example.test');
      expect(saved).toContain('PAYSTACK_SECRET_KEY=sk_test_replacement123');
      expect(saved).toContain('OBI_STRIPE_SECRET_KEY=sk_test_stripe123456');
      expect(saved).not.toContain('sk_test_original123');
    } finally { await unlink(file); await rmdir(dir); }
  });
  it('refuses duplicate keys without modifying the file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obi-payment-test-')), file = join(dir, '.dev.vars');
    const initial = 'PAYSTACK_SECRET_KEY=sk_test_original123\nPAYSTACK_SECRET_KEY=sk_test_original456\n';
    try {
      await writeFile(file, initial);
      await expect(updateLocalPaymentSecrets(file, { PAYSTACK_SECRET_KEY: 'sk_test_newvalue12345' })).rejects.toThrow('duplicate');
      expect(await readFile(file, 'utf8')).toBe(initial);
    } finally { await unlink(file); await rmdir(dir); }
  });
});
