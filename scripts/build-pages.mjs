import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, '.pages-output');
const directories = ['assets', 'admin', 'auth', 'dashboard'];
const rootExtensions = new Set(['.html', '.ico', '.png', '.svg', '.webp', '.jpg', '.jpeg', '.json', '.webmanifest', '.txt']);
const forbidden = /(?:^\.|\.map$|\.(?:php|sql|sqlite|db|pem|key|p12|pfx|log|bak)$)/i;

if (!existsSync(join(root, 'index.html'))) throw new Error('Website index.html is missing.');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name !== 'package.json' && rootExtensions.has(extname(entry.name).toLowerCase()) && !forbidden.test(entry.name)) {
    cpSync(join(root, entry.name), join(output, entry.name));
  }
}
// Copy _headers if present for Cloudflare Pages
if (existsSync(join(root, '_headers'))) {
  cpSync(join(root, '_headers'), join(output, '_headers'));
}
// Copy _redirects if present
if (existsSync(join(root, '_redirects'))) {
  cpSync(join(root, '_redirects'), join(output, '_redirects'));
}
// Preserve GitHub Pages metadata (custom domain and no-Jekyll marker).
for (const name of ['CNAME', '.nojekyll']) {
  if (existsSync(join(root, name))) cpSync(join(root, name), join(output, name));
}
for (const dir of directories) {
  const source = join(root, dir);
  if (!existsSync(source)) continue;
  cpSync(source, join(output, dir), { recursive: true, dereference: false, filter: (path) => !forbidden.test(path.split(/[\\/]/).pop()) });
}
console.log('Created .pages-output with website files only. Review before publishing.');
