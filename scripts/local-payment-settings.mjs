// Local preview helper. Never send existing credentials back to the browser.
import { lstat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

const accepted = {
  PAYSTACK_SECRET_KEY: /^sk_test_[A-Za-z0-9_]{8,240}$/,
  OBI_STRIPE_SECRET_KEY: /^sk_test_[A-Za-z0-9_]{8,240}$/,
  OBI_STRIPE_WEBHOOK_SECRET: /^whsec_[A-Za-z0-9_]{8,240}$/,
};

export function validatePaymentSecrets(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter at least one test key.');
  const entries = Object.entries(input);
  if (!entries.length || entries.some(([key, value]) => !accepted[key] || typeof value !== 'string' || !accepted[key].test(value))) {
    throw new Error('Use valid test secret keys. Live, public, empty, and malformed keys are not accepted.');
  }
  return Object.fromEntries(entries);
}

export async function updateLocalPaymentSecrets(file, input) {
  const values = validatePaymentSecrets(input);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('The local configuration file must be a regular file.');
  let text = await readFile(file, 'utf8');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  for (const [key, value] of Object.entries(values)) {
    const expression = new RegExp('^\\s*(?:export\\s+)?' + key + '\\s*=.*$', 'gm');
    const matches = [...text.matchAll(expression)];
    if (matches.length > 1) throw new Error('The local configuration contains duplicate entries. Resolve them in the file before saving.');
    if (matches.length) text = text.replace(expression, () => key + '=' + value);
    else text = text.replace(/\s*$/, '') + newline + key + '=' + value + newline;
  }
  const temp = join(dirname(file), '.dev.vars.pending-' + randomBytes(8).toString('hex'));
  try {
    await writeFile(temp, text, { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
