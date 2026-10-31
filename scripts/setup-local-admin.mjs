// Create local-only admin credentials without replacing existing Worker secrets.
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile('.dev.vars', `OBI_ADMIN_EMAIL=admin@local.test\nOBI_ADMIN_PASSWORD=${randomBytes(32).toString('hex')}\n`, { flag: 'wx' });
  console.log('Local administrator credentials were created in .dev.vars. Open that ignored file to see them. Restart the local Worker to load them.');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.error('.dev.vars already exists. No changes made. Add OBI_ADMIN_EMAIL and a unique OBI_ADMIN_PASSWORD of at least 24 characters yourself.');
    process.exitCode = 1;
  } else throw error;
}
