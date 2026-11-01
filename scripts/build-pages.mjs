import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, '.pages-output');
const directories = ['assets', 'admin', 'auth', 'dashboard'];
const rootExtensions = new Set(['.html', '.ico', '.png', '.svg', '.webp', '.jpg', '.jpeg', '.json', '.webmanifest']);
const forbidden = /(?:^\.|\.map$|\.(?:php|sql|sqlite|db|pem|key|p12|pfx|log|bak)$)/i;

if (!existsSync(join(root, 'index.html'))) throw new Error('Website index.html is missing.');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name !== 'package.json' && rootExtensions.has(extname(entry.name).toLowerCase()) && !forbidden.test(entry.name)) {
    cpSync(join(root, entry.name), join(output, entry.name));
  }
}
for (const dir of directories) {
  const source = join(root, dir);
  if (!existsSync(source)) continue;
  cpSync(source, join(output, dir), { recursive: true, dereference: false, filter: (path) => !forbidden.test(path.split(/[\\/]/).pop()) });
}
console.log('Created .pages-output with website files only. Review before publishing.');
