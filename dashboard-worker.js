// OBI-ISM production payment and entitlement worker.
// The full edition is compiled into this Worker at deployment time; it is never included in public site files.
const PRICE = 995;
const SKU = "obi_ism_complete_edition";
const EVENT = "checkout.session.completed";

const schema = `
CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, status TEXT NOT NULL, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS purchases_email_idx ON purchases(purchaser_email);`;

const encoder = new TextEncoder();
const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(init.headers || {}),
  },
});
const allowedOrigins = new Set(["https://readobiism.com", "https://www.readobiism.com"]);
const cors = (request) => allowedOrigins.has(request.headers.get("Origin"))
  ? { "access-control-allow-origin": request.headers.get("Origin"), vary: "Origin" }
  : {};
const reply = (data, request, init = {}) => json(data, {
  ...init,
  headers: { ...cors(request), ...(init.headers || {}) },
});
const hex = (value) => [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const same = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
};

async function validSignature(body, header, secret) {
  if (!header || !secret?.startsWith("whsec_")) return false;
  const values = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = Number(values.t);
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 || !values.v1) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return same(values.v1, hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`))));
}

async function hashDeviceToken(token) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}

function validSessionId(sessionId) {
  return typeof sessionId === "string" && /^cs_[A-Za-z0-9_]{12,255}$/.test(sessionId);
}

function validDeviceToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{24,256}$/.test(token);
}

async function ensure(env) {
  if (!env.OBI_DB) throw new Error("OBI_DB binding unavailable");
  await env.OBI_DB.exec(schema);
}

function expected(session) {
  return session?.id?.startsWith("cs_")
    && session.payment_status === "paid"
    && session.currency?.toLowerCase() === "usd"
    && session.amount_total === PRICE
    && session.metadata?.product_sku === SKU
    && /^[a-f0-9]{64}$/.test(session.metadata?.device_hash || "");
}

async function activePurchase(env, sessionId) {
  await ensure(env);
  return env.OBI_DB.prepare("SELECT checkout_session_id FROM purchases WHERE checkout_session_id=? AND status='active'").bind(sessionId).first();
}

async function checkout(request, env) {
  if (!env.OBI_STRIPE_SECRET_KEY?.startsWith("sk_")) return reply({ error: "Checkout is not configured" }, request, { status: 503 });
  const { email = "", device_token: deviceToken = "" } = await request.json().catch(() => ({}));
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) return reply({ error: "A valid email address is required" }, request, { status: 400 });
  if (!validDeviceToken(deviceToken)) return reply({ error: "A secure reader device is required" }, request, { status: 400 });

  const origin = env.OBI_PUBLIC_APP_URL === "https://readobiism.com" ? env.OBI_PUBLIC_APP_URL : "https://readobiism.com";
  const deviceHash = await hashDeviceToken(deviceToken);
  const form = new URLSearchParams({
    mode: "payment",
    customer_email: email.trim().toLowerCase(),
    success_url: `${origin}/reader.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?purchase=cancelled`,
    "metadata[product_sku]": SKU,
    "metadata[purchaser_email]": email.trim().toLowerCase(),
    "metadata[device_hash]": deviceHash,
    "payment_intent_data[metadata][product_sku]": SKU,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(PRICE),
    "line_items[0][price_data][product_data][name]": "OBI-ISM: Building a Just Society Through Character",
    "line_items[0][price_data][product_data][tax_code]": "txcd_10302000",
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OBI_STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const result = await response.json();
  return response.ok && result.url && validSessionId(result.id)
    ? reply({ url: result.url, sessionId: result.id }, request)
    : reply({ error: "Unable to start secure checkout" }, request, { status: 502 });
}

async function recordCheckoutCompletion(event, env) {
  const session = event.data?.object;
  if (event?.type !== EVENT || !event.id?.startsWith("evt_") || !expected(session)) return { received: true, ignored: true };
  await ensure(env);
  const now = new Date().toISOString();
  const email = String(session.customer_details?.email || session.customer_email || session.metadata?.purchaser_email || "").toLowerCase() || null;
  const deviceHash = session.metadata.device_hash;
  const result = await env.OBI_DB.batch([
    env.OBI_DB.prepare("INSERT OR IGNORE INTO webhook_events (event_id,event_type,status,received_at) VALUES (?,?,?,?)").bind(event.id, EVENT, "processed", now),
    env.OBI_DB.prepare("INSERT OR IGNORE INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at) VALUES (?,?,?,?,?,?,?,?)").bind(session.id, typeof session.payment_intent === "string" ? session.payment_intent : null, email, PRICE, "usd", SKU, "active", now),
    env.OBI_DB.prepare("INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)").bind(session.id, deviceHash, now),
  ]);
  return {
    received: true,
    event: result[0].meta.changes ? "processed" : "duplicate",
    entitlement: result[1].meta.changes ? "granted" : "already_granted",
  };
}

async function webhook(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  if (!env.OBI_STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) return json({ error: "Stripe webhook is not configured" }, { status: 503 });
  const raw = await request.text();
  if (!(await validSignature(raw, request.headers.get("stripe-signature"), env.OBI_STRIPE_WEBHOOK_SECRET))) return json({ error: "Webhook signature verification failed" }, { status: 400 });
  const event = await Promise.resolve().then(() => JSON.parse(raw)).catch(() => null);
  try {
    return json(await recordCheckoutCompletion(event, env));
  } catch (error) {
    console.error("Webhook fulfillment failed", error);
    return json({ error: "Webhook fulfillment failed" }, { status: 500 });
  }
}

async function claimReader(request, env) {
  const { session_id: sessionId, device_token: deviceToken } = await request.json().catch(() => ({}));
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken)) return reply({ error: "Invalid reader access request" }, request, { status: 400 });
  if (!(await activePurchase(env, sessionId))) return reply({ error: "Purchase is not ready yet. Please retry shortly." }, request, { status: 404 });
  const deviceHash = await hashDeviceToken(deviceToken);
  const existing = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(sessionId).first();
  if (existing && !same(existing.device_hash, deviceHash)) return reply({ error: "This edition is already active on another device." }, request, { status: 409 });
  if (!existing) return reply({ error: "Purchase is being finalized. Please retry shortly." }, request, { status: 404 });
  return reply({ access: true, deviceBound: true }, request);
}

async function reader(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const deviceToken = url.searchParams.get("device_token");
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken)) return reply({ error: "Reader access is required" }, request, { status: 403 });
  if (!(await activePurchase(env, sessionId))) return reply({ error: "Reader access is not active" }, request, { status: 403 });
  const deviceHash = await hashDeviceToken(deviceToken);
  const boundDevice = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(sessionId).first();
  if (!boundDevice || !same(boundDevice.device_hash, deviceHash)) return reply({ error: "Reader is not authorized on this device" }, request, { status: 403 });
  const sections = await env.OBI_DB.prepare("SELECT section_id, label, title, kind, paragraphs_json FROM book_sections ORDER BY position ASC").all();
  if (!sections.results?.length) return reply({ error: "The protected edition is being prepared. Please retry shortly." }, request, { status: 503 });
  return reply({
    title: "OBI-ISM",
    subtitle: "Building a Just Society Through Character",
    authors: "Eze Echesi & Mpamugo",
    chapters: sections.results.map((section) => ({
      id: section.section_id,
      label: section.label,
      title: section.title,
      kind: section.kind,
      paragraphs: JSON.parse(section.paragraphs_json),
    })),
  }, request);
}

export {
  expected as hasExpectedBookPayment,
  hashDeviceToken,
  validDeviceToken,
  validSessionId,
  validSignature as verifyStripeSignature,
  recordCheckoutCompletion,
};

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS" && path.startsWith("/api/")) return new Response(null, {
      status: 204,
      headers: {
        ...cors(request),
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
    if (path === "/api/health") return json({ status: "ok", service: "obi-ism-payments" });
    if (path === "/api/stripe/webhook") return webhook(request, env);
    if (path === "/api/checkout" && request.method === "POST") return checkout(request, env);
    if (path === "/api/reader/claim" && request.method === "POST") return claimReader(request, env);
    if (path === "/api/reader" && request.method === "GET") return reader(request, env);
    if (path === "/api/access" && request.method === "GET") {
      const sessionId = new URL(request.url).searchParams.get("session_id");
      if (!validSessionId(sessionId)) return reply({ access: false }, request, { status: 400 });
      return reply({ access: Boolean(await activePurchase(env, sessionId)) }, request);
    }
    return json({ error: "Not found" }, { status: 404 });
  },
};
