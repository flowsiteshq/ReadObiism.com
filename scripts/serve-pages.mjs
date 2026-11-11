import { createServer } from 'node:http';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the curated static artifact is served; the repository also contains
// Worker source and private development files which must never be public.
const root = realpathSync(resolve(fileURLToPath(new URL('../.pages-output/', import.meta.url))));
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.mp4':'video/mp4', '.webm':'video/webm', '.txt':'text/plain; charset=utf-8' };
const inside = (file) => { const rel = relative(root, file); return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };
createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname.includes('\0') || pathname.split(/[\\/]/).some(part => part.startsWith('.'))) { res.writeHead(404).end('Not found'); return; }
  const base = resolve(root, '.' + pathname);
  if (!inside(base)) { res.writeHead(404).end('Not found'); return; }
  const candidates = pathname.endsWith('/') ? [join(base, 'index.html')] : [base, base + '.html', join(base, 'index.html')];
  for (const candidate of candidates) {
    try {
      const actual = realpathSync(candidate);
      const stat = statSync(actual);
      if (!inside(actual) || !stat.isFile()) continue;
      const headers = { 'Content-Type': types[extname(actual).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Accept-Ranges':'bytes' };
      let start = 0, end = stat.size - 1, status = 200;
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
        if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, stat.size - suffix); }
        else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
      createReadStream(actual, { start, end }).on('error', () => res.destroy()).pipe(res);
      return;
    } catch { /* Try the next static path. */ }
  }
  res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }).end('Not found');
}).listen(port, '0.0.0.0', () => console.log(`Static site listening on port ${port}`));
