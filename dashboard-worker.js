const PRICE = 995;
const SKU = "obi_ism_complete_edition";
const EVENT = "checkout.session.completed";
const schema = `
CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, status TEXT NOT NULL, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS purchases_email_idx ON purchases(purchaser_email);`;
const enc = new TextEncoder();
const json = (data, init = {}) => new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init.headers || {}) } });
const cors = (req) => ["https://readobiism.com", "https://www.readobiism.com"].includes(req.headers.get("Origin")) ? { "access-control-allow-origin": req.headers.get("Origin"), vary: "Origin" } : {};
const reply = (data, req, init = {}) => json(data, { ...init, headers: { ...cors(req), ...(init.headers || {}) } });
const hex = (value) => [...new Uint8Array(value)].map((b) => b.toString(16).padStart(2, "0")).join("");
const same = (a, b) => { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; };
async function validSignature(body, header, secret) {
  if (!header || !secret?.startsWith("whsec_")) return false;
  const values = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = Number(values.t);
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 || !values.v1) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return same(values.v1, hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`))));
}
async function ensure(env) { if (!env.OBI_DB) throw new Error("OBI_DB binding unavailable"); await env.OBI_DB.exec(schema); }
function expected(session) { return session?.id?.startsWith("cs_") && session.payment_status === "paid" && session.currency?.toLowerCase() === "usd" && session.amount_total === PRICE && session.metadata?.product_sku === SKU; }
async function checkout(req, env) {
  if (!env.OBI_STRIPE_SECRET_KEY?.startsWith("sk_")) return reply({ error: "Checkout is not configured" }, req, { status: 503 });
  const { email = "" } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) return reply({ error: "A valid email address is required" }, req, { status: 400 });
  const origin = env.OBI_PUBLIC_APP_URL === "https://readobiism.com" ? env.OBI_PUBLIC_APP_URL : "https://readobiism.com";
  const form = new URLSearchParams({ mode: "payment", customer_email: email.trim().toLowerCase(), success_url: `${origin}/?purchase=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/?purchase=cancelled`, "metadata[product_sku]": SKU, "metadata[purchaser_email]": email.trim().toLowerCase(), "payment_intent_data[metadata][product_sku]": SKU, "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(PRICE), "line_items[0][price_data][product_data][name]": "OBI-ISM: Building a Just Society Through Character" });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${env.OBI_STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" }, body: form });
  const result = await response.json();
  return response.ok && result.url ? reply({ url: result.url }, req) : reply({ error: "Unable to start secure checkout" }, req, { status: 502 });
}
async function webhook(req, env) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  if (!env.OBI_STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) return json({ error: "Stripe webhook is not configured" }, { status: 503 });
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("stripe-signature"), env.OBI_STRIPE_WEBHOOK_SECRET))) return json({ error: "Webhook signature verification failed" }, { status: 400 });
  const event = await Promise.resolve().then(() => JSON.parse(raw)).catch(() => null);
  if (event?.type !== EVENT) return json({ received: true, ignored: true });
  const session = event.data?.object;
  if (!event.id?.startsWith("evt_") || !expected(session)) return json({ received: true, ignored: true });
  try {
    await ensure(env);
    const now = new Date().toISOString();
    const email = String(session.customer_details?.email || session.customer_email || session.metadata?.purchaser_email || "").toLowerCase() || null;
    const result = await env.OBI_DB.batch([
      env.OBI_DB.prepare("INSERT OR IGNORE INTO webhook_events (event_id,event_type,status,received_at) VALUES (?,?,?,?)").bind(event.id, EVENT, "processed", now),
      env.OBI_DB.prepare("INSERT OR IGNORE INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at) VALUES (?,?,?,?,?,?,?,?)").bind(session.id, typeof session.payment_intent === "string" ? session.payment_intent : null, email, PRICE, "usd", SKU, "active", now),
    ]);
    return json({ received: true, event: result[0].meta.changes ? "processed" : "duplicate", entitlement: result[1].meta.changes ? "granted" : "already_granted" });
  } catch (error) { console.error("Webhook fulfillment failed", error); return json({ error: "Webhook fulfillment failed" }, { status: 500 }); }
}
export default { async fetch(req, env) {
  const path = new URL(req.url).pathname;
  if (req.method === "OPTIONS" && path.startsWith("/api/")) return new Response(null, { status: 204, headers: { ...cors(req), "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
  if (path === "/api/health") return json({ status: "ok", service: "obi-ism-payments" });
  if (path === "/api/stripe/webhook") return webhook(req, env);
  if (path === "/api/checkout" && req.method === "POST") return checkout(req, env);
  if (path === "/api/access" && req.method === "GET") { const id = new URL(req.url).searchParams.get("session_id"); if (!id?.startsWith("cs_")) return reply({ access: false }, req, { status: 400 }); await ensure(env); const row = await env.OBI_DB.prepare("SELECT purchaser_email,status FROM purchases WHERE checkout_session_id=?").bind(id).first(); return reply({ access: row?.status === "active", purchaserEmail: row?.status === "active" ? row.purchaser_email : undefined }, req); }
  return json({ error: "Not found" }, { status: 404 });
}};
