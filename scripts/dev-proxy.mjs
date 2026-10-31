// Local dev server for the rebuilt web frontend.
// Serves web/ and proxies /api/* to an explicitly local Worker by default.
//
//   node scripts/dev-proxy.mjs
//   open http://127.0.0.1:5514/login.html
//
// Env: PORT (default 5514), API_ORIGIN (default local Worker on 8799).
// To intentionally use a remote API, set OBI_ALLOW_REMOTE_API=1 as well.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { updateLocalPaymentSecrets } from "./local-payment-settings.mjs";

const ROOT = resolve(process.argv[2] ?? "web");
const PORT = Number(process.env.PORT ?? 5514);
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/+$/, "");
const apiUrl = new URL(API_ORIGIN);
const localApi = ["127.0.0.1", "localhost", "[::1]"].includes(apiUrl.hostname);
if (!["127.0.0.1", "localhost", "[::1]"].includes(apiUrl.hostname) && process.env.OBI_ALLOW_REMOTE_API !== "1") {
  throw new Error("Remote API is disabled for this local preview. Set OBI_ALLOW_REMOTE_API=1 only when intentionally testing a remote environment.");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

let paymentUpdateRunning = false;
async function localPaymentSettings(req, res, body) {
  const respond = (status, data) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };
  const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
  if (!localApi || !allowedHosts.has(req.headers.host) || req.headers.origin !== `http://${req.headers.host}`
      || req.method !== "POST" || !(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return respond(403, { error: "Local same-origin request required." });
  }
  if (body.length > 4096) return respond(413, { error: "Request is too large." });
  let authenticated;
  try {
    const check = await fetch(`${API_ORIGIN}/api/admin/session`, { headers: { cookie: req.headers.cookie || "" }, cache: "no-store" });
    authenticated = check.ok && (await check.json()).authenticated === true;
  } catch {
    return respond(503, { error: "The local Worker is unavailable. Start it and try again." });
  }
  if (!authenticated) return respond(401, { error: "Administrator sign-in required." });
  let values;
  try { values = JSON.parse(body.toString("utf8")); }
  catch { return respond(400, { error: "Invalid settings request." }); }
  if (paymentUpdateRunning) return respond(409, { error: "Another update is in progress. Try again." });
  paymentUpdateRunning = true;
  try {
    await updateLocalPaymentSecrets(resolve(".dev.vars"), values);
    return respond(200, { saved: true, message: "Saved locally. Restart the local Worker to load the new keys." });
  } catch (error) {
    const message = error?.code === "ENOENT" ? "The local .dev.vars file is missing." : error.message;
    const safe = ["The local .dev.vars file is missing.", "Enter at least one test key.", "Use valid test secret keys. Live, public, empty, and malformed keys are not accepted.", "The local configuration file must be a regular file.", "The local configuration contains duplicate entries. Resolve them in the file before saving."];
    return respond(400, { error: safe.includes(message) ? message : "Could not save local settings." });
  } finally { paymentUpdateRunning = false; }
}

async function proxy(req, res, body) {
  const target = `${API_ORIGIN}${req.url}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["content-length"];
  // Node fetch does not support forwarding Expect: 100-continue.
  delete headers.expect;
  // Translate only this proxy's own origin. Preserve foreign origins so the
  // Worker can reject cross-site requests instead of laundering them.
  if (headers.origin === `http://${req.headers.host}`) headers.origin = API_ORIGIN;

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: body.length ? body : undefined,
      redirect: "manual",
    });
  } catch (error) {
    console.error(`API proxy connection failed: ${error.cause?.message || error.message}`);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Proxy could not reach ${API_ORIGIN}: ${error.message}` }));
    return;
  }

  const outHeaders = {};
  upstream.headers.forEach((value, key) => {
    if (key === "content-encoding" || key === "content-length" || key === "transfer-encoding") return;
    outHeaders[key] = value;
  });

  // Local http origin: drop Secure so the browser keeps the session cookie.
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length) {
    outHeaders["set-cookie"] = cookies.map((cookie) => cookie.replace(/;\s*Secure/gi, ""));
  }

  res.writeHead(upstream.status, outHeaders);
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.end(buffer);
  console.log(`${req.method} ${req.url} -> ${upstream.status}`);
}

const server = createServer((req, res) => {
  const chunks = [];
  let received = 0, tooLarge = false;
  const settingsRequest = req.url.split("?")[0] === "/api/admin/local-payment-settings";
  req.on("data", (chunk) => {
    received += chunk.length;
    if (settingsRequest && received > 4096) { tooLarge = true; chunks.length = 0; }
    else if (!tooLarge) chunks.push(chunk);
  });
  req.on("end", async () => {
    if (tooLarge) { res.writeHead(413, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ error: "Request is too large." })); return; }
    const body = Buffer.concat(chunks);
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

    // A directory URL needs its trailing slash for relative CSS and JS URLs.
    if (/\/admin$/i.test(pathname)) {
      res.writeHead(308, { location: `${pathname}/${new URL(req.url, "http://localhost").search}` });
      res.end();
      return;
    }

    if (pathname === "/api/admin/local-payment-settings") {
      await localPaymentSettings(req, res, body);
      return;
    }
    if (pathname.startsWith("/api/")) {
      await proxy(req, res, body);
      return;
    }

    // Accept /login.html and /readobiism-site/login.html (Five Server's
    // parent-folder layout) so existing bookmarks keep working.
    let relative = pathname.replace(/^\/+/, "").replace(/^readobiism-site\//i, "");
    // Support bookmarked extensionless login URLs as well as the actual file.
    if (/^login\/?$/i.test(relative)) relative = "login.html";
    let filePath = resolve(join(ROOT, normalize(relative)));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, "index.html");
      const final = await stat(filePath);
      if (!final.isFile()) throw new Error("not a file");
    } catch {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(`<h1>404</h1><p>${pathname} not found in ${ROOT}</p>`);
      return;
    }

    res.writeHead(200, {
      "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Serving ${ROOT}`);
  console.log(`http://127.0.0.1:${PORT}/login.html`);
  console.log(`Proxying /api/* -> ${API_ORIGIN}`);
});
