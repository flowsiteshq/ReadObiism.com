import { validDeviceToken, validSessionId } from "./api/src/validation.js";
import { hashDeviceToken, same } from "./api/src/security.js";
import { handleAdminAuth } from "./api/src/admin-auth.js";
import { bulkLocalEnabled, redeemBulkLocal } from "./api/src/bulk-local.js";
import { createBulkOrderCheckout, verifyBulkOrderPayment, claimBulkOrder } from "./api/src/bulk-orders.js";
import { USD_PRICE_CENTS as PRICE, NGN_PRICE_KOBO, EDITION_SKU as SKU } from "./api/src/pricing.js";

// OBI-ISM production payment and entitlement worker.
// The full edition is compiled into this Worker at deployment time; it is never included in public site files.
const NAIRA_PRICE = NGN_PRICE_KOBO / 100;
const EVENT = "checkout.session.completed";
const NARRATOR_VOICE_ID = "F18yf5BixLZCvKiiW0yJ"; // Steven — West African Narrator

/**
 * Fixed-window abuse limits. Counters live in D1 so every Worker isolate
 * shares them. Limits are keyed by a hash of the device token, IP, or email,
 * never the raw value, so the table cannot be used to recover credentials.
 *
 * reader-sections is the scrape guard: 30 section fetches per 10 minutes is
 * far above normal reading and pushes a full-book copy past the point where
 * it is one casual request.
 */
const RATE_LIMITS = {
  "reader-ip": { limit: 120, windowSeconds: 300 },
  "reader-device": { limit: 60, windowSeconds: 300 },
  "reader-sections": { limit: 30, windowSeconds: 600 },
  "claim-ip": { limit: 20, windowSeconds: 3600 },
  "claim-device": { limit: 10, windowSeconds: 3600 },
  // Separate, more generous buckets for the loopback Paystack test Worker.
  "claim-ip-local-test": { limit: 200, windowSeconds: 3600 },
  "claim-device-local-test": { limit: 100, windowSeconds: 3600 },
  "login-ip": { limit: 25, windowSeconds: 900 },
  "login-account": { limit: 10, windowSeconds: 900 },
  "register-ip": { limit: 6, windowSeconds: 3600 },
  "register-email": { limit: 3, windowSeconds: 3600 },
  "checkout-ip": { limit: 15, windowSeconds: 3600 },
  "gift-redeem-ip": { limit: 20, windowSeconds: 3600 },
  "gift-redeem-code": { limit: 10, windowSeconds: 3600 },
  "bulk-local-ip": { limit: 60, windowSeconds: 3600 },
  "bulk-local-account": { limit: 20, windowSeconds: 3600 },
  "bulk-order-ip": { limit: 30, windowSeconds: 3600 },
  "bulk-order-account": { limit: 15, windowSeconds: 3600 },
  "narration-device": { limit: 60, windowSeconds: 3600 },
};

let limitCallCount = 0;

const schema = `
CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, status TEXT NOT NULL, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS device_transfer_challenges (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, old_device_hash TEXT NOT NULL, new_device_hash TEXT NOT NULL, code_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT);
CREATE INDEX IF NOT EXISTS device_transfer_challenges_account_idx ON device_transfer_challenges(account_id, created_at);
CREATE TABLE IF NOT EXISTS device_transfer_audit (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gift_orders (code TEXT PRIMARY KEY, checkout_session_id TEXT UNIQUE NOT NULL, buyer_email TEXT NOT NULL, recipient_name TEXT NOT NULL, recipient_email TEXT NOT NULL, message TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, redeemed_at TEXT);
CREATE INDEX IF NOT EXISTS gift_orders_email_idx ON gift_orders(recipient_email);
CREATE INDEX IF NOT EXISTS gift_orders_session_idx ON gift_orders(checkout_session_id);
CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS purchases_email_idx ON purchases(purchaser_email);
CREATE TABLE IF NOT EXISTS obi_accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_signed_in TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS obi_account_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON obi_account_sessions(account_id);
CREATE TABLE IF NOT EXISTS account_verification_challenges (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, code_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT);
CREATE INDEX IF NOT EXISTS account_verification_challenges_account_idx ON account_verification_challenges(account_id, created_at);
CREATE TABLE IF NOT EXISTS request_limits (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS abuse_events (id TEXT PRIMARY KEY, route TEXT NOT NULL, limit_name TEXT NOT NULL, identity_hash TEXT NOT NULL, retry_after INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS abuse_events_created_idx ON abuse_events(created_at);`;

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
// Extra origins are allowed only when the deployment sets OBI_DEV_ORIGINS (comma separated).
const devOrigins = new Set();
const cors = (request) => {
  const origin = request.headers.get("Origin");
  const allowed = origin && (allowedOrigins.has(origin) || devOrigins.has(origin));
  return allowed
    ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" }
    : {};
};
const reply = (data, request, init = {}) => json(data, {
  ...init,
  headers: { ...cors(request), ...(init.headers || {}) },
});
const hex = (value) => [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

async function validSignature(body, header, secret) {
  if (!header || !secret?.startsWith("whsec_")) return false;
  const values = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = Number(values.t);
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 || !values.v1) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return same(values.v1, hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`))));
}

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return request.headers.get("CF-Connecting-IP")
    || (forwarded ? forwarded.split(",")[0].trim() : "")
    || "unknown";
}

/** Opportunistic maintenance so the counters table cannot grow forever. */
async function trimExpiredLimits(env, nowSeconds) {
  limitCallCount += 1;
  if (limitCallCount % 500 !== 0) return;
  try {
    const statement = env.OBI_DB.prepare("DELETE FROM request_limits WHERE window_start < ?").bind(nowSeconds - 86400);
    if (typeof statement.run === "function") await statement.run();
  } catch (error) {
    console.error("Rate-limit cleanup failed", error);
  }
}

/**
 * Atomically increments a fixed-window counter and reports whether the
 * caller is over the limit. Fails open: a limiter outage must never lock a
 * paid reader out of the book.
 */
async function consumeLimit(env, limitName, identity, nowSeconds = Math.floor(Date.now() / 1000)) {
  const config = RATE_LIMITS[limitName];
  if (!config || !env?.OBI_DB) return { allowed: true, remaining: 0, retryAfter: 0, identityHash: "" };

  const identityHash = await hashDeviceToken(String(identity || "anonymous"));
  const windowStart = nowSeconds - (nowSeconds % config.windowSeconds);
  await trimExpiredLimits(env, nowSeconds);
  try {
    const row = await env.OBI_DB.prepare(
      "INSERT INTO request_limits (bucket, window_start, count) VALUES (?,?,1) " +
      "ON CONFLICT(bucket) DO UPDATE SET " +
      "count = CASE WHEN request_limits.window_start = excluded.window_start THEN request_limits.count + 1 ELSE 1 END, " +
      "window_start = excluded.window_start RETURNING count",
    ).bind(`${limitName}:${identityHash}`, windowStart).first();
    const count = Number(row?.count ?? 1);
    if (count > config.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, windowStart + config.windowSeconds - nowSeconds),
        identityHash,
      };
    }
    return { allowed: true, remaining: Math.max(0, config.limit - count), retryAfter: 0, identityHash };
  } catch (error) {
    console.error("Rate limiter failed", error);
    return { allowed: true, remaining: config.limit, retryAfter: 0, identityHash };
  }
}

async function recordAbuse(env, route, limitName, identityHash, retryAfter) {
  if (!env?.OBI_DB) return;
  try {
    const statement = env.OBI_DB.prepare(
      "INSERT INTO abuse_events (id,route,limit_name,identity_hash,retry_after,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(`abuse_${await randomToken(12)}`, route, limitName, identityHash, retryAfter, new Date().toISOString());
    if (typeof statement.run === "function") await statement.run();
  } catch (error) {
    // Never let an audit-write failure turn into a reader outage.
    console.error("Abuse event logging failed", error);
  }
}

/** Returns a ready-to-send 429 response, or null when the caller may proceed. */
async function enforceLimit(request, env, route, limitName, identity) {
  const result = await consumeLimit(env, limitName, identity);
  if (result.allowed) return null;

  await recordAbuse(env, route, limitName, result.identityHash, result.retryAfter);
  console.warn(`Rate limit exceeded: ${limitName} on ${route}`);
  return reply(
    { error: "Too many requests. Please wait a moment and try again.", retryAfter: result.retryAfter },
    request,
    { status: 429, headers: { "retry-after": String(result.retryAfter) } },
  );
}

// Gift codes are minted in the buyer's browser, e.g. OBI-7K2M-P9QX-4HWD.
// The alphabet avoids 0/O and 1/I so a code can be read aloud or typed.
const GIFTS = /^OBI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const normalizeGiftCode = (value) =>
  typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";
const validGiftCode = (value) => GIFTS.test(normalizeGiftCode(value));
const validEmail = (value) => typeof value === "string" && /^\S+@\S+\.\S+$/.test(value);

const publicOrigin = (env) =>
  env.OBI_PUBLIC_APP_URL === "https://readobiism.com" ? env.OBI_PUBLIC_APP_URL : "https://readobiism.com";

// Local checkout testing never enables this behavior for a deployed Worker or
// a live Paystack key. A local return address also keeps test purchases in the
// browser origin that started the checkout.
function localPaystackTest(request, env) {
  const host = new URL(request.url).hostname;
  return (host === "127.0.0.1" || host === "localhost") && env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_");
}

const paystackApi = (env) => String(env.PAYSTACK_API_BASE || "https://api.paystack.co").replace(/\/+$/, "");

function paystackReference() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `obi_${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

async function paystackSignature(body, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
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

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: base64ToBytes(salt), iterations: 120000, hash: "SHA-256" }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

async function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(value).replace(/[^A-Za-z0-9]/g, "").slice(0, 48);
}

function cookieValue(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

// Native builds (Expo) send no Origin header; browsers always do.
function isNativeClient(request) {
  return !request.headers.get("Origin");
}

// Local browser development uses Bearer auth because SameSite cookies are not
// portable across Live Server and wrangler ports. Production stays cookie-only.
function usesBearerAuth(request) {
  return isNativeClient(request) || devOrigins.has(request.headers.get("Origin"));
}

async function accountFromRequest(request, env) {
  const token = bearerToken(request) || cookieValue(request, "obiism_session");
  if (!token) return null;
  const tokenHash = await hashDeviceToken(token);
  await ensure(env);
  const row = await env.OBI_DB.prepare("SELECT a.id, a.email FROM obi_accounts a JOIN obi_account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? ").bind(tokenHash, new Date().toISOString()).first();
  return row || null;
}

function authCookie(token) {
  return `obiism_session=${encodeURIComponent(token)}; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

// Old manual test rows may contain references the reader cannot accept. Do
// not send users to those rows or let them hide a valid provider reference.
async function accountPurchase(env, email) {
  const row = await env.OBI_DB.prepare(`SELECT p.checkout_session_id FROM purchases p
    LEFT JOIN gift_orders g ON g.checkout_session_id=p.checkout_session_id
    WHERE p.status='active' AND (p.checkout_session_id GLOB 'obi_*' OR p.checkout_session_id GLOB 'cs_*')
      AND ((g.checkout_session_id IS NULL AND lower(p.purchaser_email)=lower(?))
        OR (g.status='redeemed' AND lower(g.recipient_email)=lower(?)))
    ORDER BY p.granted_at DESC LIMIT 1`).bind(email, email).first();
  return row && validSessionId(row.checkout_session_id) ? row : null;
}

async function registerAccount(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) return reply({ error: "Enter a valid email and a password of at least 8 characters." }, request, { status: 400 });
  await ensure(env);
  const rateLimited = (await enforceLimit(request, env, "register", "register-ip", clientIp(request)))
    || (await enforceLimit(request, env, "register", "register-email", email));
  if (rateLimited) return rateLimited;
  const existing = await env.OBI_DB.prepare("SELECT id FROM obi_accounts WHERE email=?").bind(email).first();
  if (existing) return reply({ error: "An account already exists for this email. Sign in instead." }, request, { status: 409 });
  const id = `acct_${await randomToken(18)}`;
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const digest = await passwordDigest(password, salt);
  const now = new Date();
  const token = await randomToken();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare("INSERT INTO obi_accounts (id,email,password_hash,password_salt,created_at,last_signed_in) VALUES (?,?,?,?,?,?)").bind(id, email, digest, salt, now.toISOString(), now.toISOString()),
    env.OBI_DB.prepare("INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)").bind(await hashDeviceToken(token), id, now.toISOString(), new Date(now.getTime() + 2592000000).toISOString()),
  ]);
  const purchase = await accountPurchase(env, email);
  return reply({ account: { email, email_verified: false }, access: Boolean(purchase), sessionId: purchase?.checkout_session_id ?? null, ...(usesBearerAuth(request) ? { token } : {}) }, request, { headers: { "set-cookie": authCookie(token) } });
}

async function loginAccount(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  await ensure(env);
  const rateLimited = (await enforceLimit(request, env, "login", "login-ip", clientIp(request)))
    || (await enforceLimit(request, env, "login", "login-account", email || "anonymous"));
  if (rateLimited) return rateLimited;
  const account = await env.OBI_DB.prepare("SELECT id,email,password_hash,password_salt FROM obi_accounts WHERE email=?").bind(email).first();
  if (!account || !(await passwordDigest(password, account.password_salt)).startsWith(account.password_hash)) return reply({ error: "Email or password is incorrect." }, request, { status: 401 });
  const now = new Date();
  const token = await randomToken();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare("UPDATE obi_accounts SET last_signed_in=? WHERE id=?").bind(now.toISOString(), account.id),
    env.OBI_DB.prepare("INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)").bind(await hashDeviceToken(token), account.id, now.toISOString(), new Date(now.getTime() + 2592000000).toISOString()),
  ]);
  const purchase = await accountPurchase(env, account.email);
  return reply({ account: { email: account.email }, access: Boolean(purchase), sessionId: purchase?.checkout_session_id ?? null, ...(usesBearerAuth(request) ? { token } : {}) }, request, { headers: { "set-cookie": authCookie(token) } });
}

async function accountAccess(request, env) {
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ authenticated: false, access: false }, request, { status: 401 });
  const purchase = await accountPurchase(env, account.email);
  const acc = await env.OBI_DB.prepare("SELECT email_verified FROM obi_accounts WHERE id=?").bind(account.id).first().catch(() => null);
  return reply({ authenticated: true, email: account.email, email_verified: acc?.email_verified === 1, access: Boolean(purchase), sessionId: purchase?.checkout_session_id || null }, request);
}

async function checkout(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email = "", device_token: deviceToken = "", currency = "USD" } = body;
  const signedIn = await accountFromRequest(request, env);
  const checkoutEmail = signedIn?.email || email;
  if (typeof checkoutEmail !== "string" || !/^\S+@\S+\.\S+$/.test(checkoutEmail)) return reply({ error: "A valid email address is required" }, request, { status: 400 });
  if (!validDeviceToken(deviceToken)) return reply({ error: "A secure reader device is required" }, request, { status: 400 });
  const gift = body.gift === true ? {
    code: normalizeGiftCode(body.gift_code),
    recipientName: typeof body.recipient_name === "string" ? body.recipient_name.trim().slice(0, 80) : "",
    recipientEmail: typeof body.recipient_email === "string" ? body.recipient_email.trim().toLowerCase() : "",
    message: typeof body.gift_message === "string" ? body.gift_message.trim().slice(0, 240) : "",
  } : null;
  await ensure(env);
  const rateLimited = await enforceLimit(request, env, "checkout", "checkout-ip", clientIp(request));
  if (rateLimited) return rateLimited;

  if (gift) {
    if (!validGiftCode(gift.code)) return reply({ error: "A valid gift code is required." }, request, { status: 400 });
    if (gift.recipientName.length < 2) return reply({ error: "Enter your friend's name." }, request, { status: 400 });
    if (!validEmail(gift.recipientEmail)) return reply({ error: "Enter a valid email address for your friend." }, request, { status: 400 });
    if (gift.recipientEmail === checkoutEmail.trim().toLowerCase()) return reply({ error: "Use a different email address for your friend." }, request, { status: 400 });
    const used = await env.OBI_DB.prepare("SELECT status FROM gift_orders WHERE code=?").bind(gift.code).first();
    if (used) return reply({ error: "That gift code is already in use. Please try again." }, request, { status: 409 });
  }

  if (String(currency).toUpperCase() === "NGN") {
    return paystackCheckout(request, env, checkoutEmail.trim().toLowerCase(), deviceToken, gift);
  }

  if (!env.OBI_STRIPE_SECRET_KEY?.startsWith("sk_")) return reply({ error: "Checkout is not configured" }, request, { status: 503 });

  const origin = publicOrigin(env);
  const deviceHash = await hashDeviceToken(deviceToken);
  const form = new URLSearchParams({
    mode: "payment",
    customer_email: checkoutEmail.trim().toLowerCase(),
    success_url: `${origin}/reader.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?purchase=cancelled`,
    "metadata[product_sku]": SKU,
    "metadata[purchaser_email]": checkoutEmail.trim().toLowerCase(),
    "metadata[device_hash]": deviceHash,
    "payment_intent_data[metadata][product_sku]": SKU,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(PRICE),
    "line_items[0][price_data][product_data][name]": "OBI-ISM: Building a Just Society Through Character",
    "line_items[0][price_data][product_data][tax_code]": "txcd_10302000",
  });
  if (gift) {
    form.set("success_url", `${origin}/gift-confirmation.html?session_id={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${origin}/?purchase=cancelled&gift=1#edition`);
    form.set("metadata[gift]", "1");
    form.set("metadata[gift_code]", gift.code);
    form.set("metadata[recipient_name]", gift.recipientName);
    form.set("metadata[recipient_email]", gift.recipientEmail);
    form.set("metadata[gift_message]", gift.message);
    form.set("payment_intent_data[metadata][gift_code]", gift.code);
  }
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
    ? reply({ url: result.url, sessionId: result.id, provider: "stripe", currency: "USD", amount: PRICE }, request)
    : reply({ error: "Unable to start secure checkout" }, request, { status: 502 });
}

/**
 * Naira checkout via Paystack. We mint our own reader reference (`obi_…`) and
 * use it as the reader session key, so the reader/claim flow is provider-neutral.
 */
async function paystackCheckout(request, env, email, deviceToken, gift = null) {
  if (!env.PAYSTACK_SECRET_KEY?.startsWith("sk_")) return reply({ error: "Naira checkout is not configured" }, request, { status: 503 });

  const reference = paystackReference();
  const deviceHash = await hashDeviceToken(deviceToken);
  const origin = localPaystackTest(request, env) ? "http://127.0.0.1:5514" : publicOrigin(env);
  const callback = gift
    ? `${origin}/gift-confirmation.html?session_id=${reference}`
    : `${origin}/reader.html?session_id=${reference}`;

  const response = await fetch(`${paystackApi(env)}/transaction/initialize`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: NAIRA_PRICE * 100,
      currency: "NGN",
      reference,
      callback_url: callback,
      metadata: {
        product_sku: SKU,
        purchaser_email: email,
        device_hash: deviceHash,
        provider: "paystack",
        ...(gift ? {
          gift: "1",
          gift_code: gift.code,
          recipient_name: gift.recipientName,
          recipient_email: gift.recipientEmail,
          gift_message: gift.message,
        } : {}),
      },
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.status || !result.data?.authorization_url) {
    return reply({ error: result.message || "Unable to start Naira checkout" }, request, { status: 502 });
  }

  return reply(
    {
      url: result.data.authorization_url,
      sessionId: reference,
      provider: "paystack",
      currency: "NGN",
      amount: NAIRA_PRICE,
    },
    request,
  );
}

/** Extracts a gift payload from provider metadata, or null for ordinary purchases. */
function giftDetails(metadata) {
  if (!metadata || String(metadata.gift) !== "1") return null;
  const code = normalizeGiftCode(metadata.gift_code);
  const recipientName = String(metadata.recipient_name || "").trim().slice(0, 80);
  const recipientEmail = String(metadata.recipient_email || "").trim().toLowerCase().slice(0, 254);
  const message = String(metadata.gift_message || "").trim().slice(0, 240);
  if (!validGiftCode(code) || !validEmail(recipientEmail) || recipientName.length < 2) return null;
  return { code, recipientName, recipientEmail, message };
}

async function saveGiftOrder(env, gift, sessionId, buyerEmail) {
  const result = await env.OBI_DB.prepare(
    "INSERT OR IGNORE INTO gift_orders (code,checkout_session_id,buyer_email,recipient_name,recipient_email,message,status,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).bind(gift.code, sessionId, buyerEmail || "", gift.recipientName, gift.recipientEmail, gift.message, "active", new Date().toISOString()).run();
  return { ...gift, stored: (result?.meta?.changes ?? 0) > 0 };
}

/**
 * Optional automatic delivery. Set RESEND_API_KEY and GIFT_FROM_EMAIL (a
 * verified sender such as gifts@readobiism.com) to email the code to the
 * friend. Without those secrets the buyer still receives the code on the
 * confirmation page and can share it by email or WhatsApp.
 */
async function sendGiftCodeEmail(env, gift) {
  if (!env.RESEND_API_KEY?.startsWith("re_") || !env.GIFT_FROM_EMAIL) return false;
  const link = `${publicOrigin(env)}/redeem.html?code=${encodeURIComponent(gift.code)}`;
  const note = gift.message ? `<p style="color:#5f584c;font-size:14px;line-height:1.6;border-left:3px solid #ebc968;padding-left:12px">${escapeHtml(gift.message)}</p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f1e4;padding:32px;font-family:Inter,Arial,sans-serif;color:#17140e">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:32px">
      <p style="font-family:Georgia,serif;font-size:30px;font-weight:700;letter-spacing:-.06em;margin:0 0 6px">OBI–<span style="color:#a87918">ISM</span></p>
      <p style="font-size:10px;font-weight:800;letter-spacing:.22em;color:#8b6a1c;margin:0 0 22px">A GIFT OF CHARACTER</p>
      <h1 style="font-family:Georgia,serif;font-size:30px;letter-spacing:-.04em;line-height:1.05;margin:0 0 12px">${escapeHtml(gift.recipientName)}, you have a gift.</h1>
      <p style="color:#5f584c;font-size:14px;line-height:1.6;margin:0 0 22px">Someone bought you the complete OBI-ISM digital edition: Building a Just Society Through Character.</p>
      <p style="font-size:9px;font-weight:800;letter-spacing:.2em;color:#8b6a1c;margin:0 0 8px">YOUR UNIQUE GIFT CODE</p>
      <p style="font-family:ui-monospace,Consolas,monospace;font-size:24px;font-weight:800;letter-spacing:.04em;margin:0 0 22px">${escapeHtml(gift.code)}</p>
      ${note}
      <p style="margin:26px 0"><a href="${escapeHtml(link)}" style="background:#17140e;border-radius:999px;color:#ebc968;display:inline-block;font-size:11px;font-weight:800;letter-spacing:.12em;padding:15px 24px;text-decoration:none">UNLOCK MY EDITION →</a></p>
      <p style="color:#6f6757;font-size:12px;line-height:1.6;margin:0">Redeem with this email address: <strong>${escapeHtml(gift.recipientEmail)}</strong>. The code works once and binds to one device.</p>
    </div>
  </body></html>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.GIFT_FROM_EMAIL,
        to: [gift.recipientEmail],
        subject: `${gift.recipientName}, your OBI-ISM gift is ready`,
        html,
      }),
    });
    if (!response.ok) console.error("Gift email delivery failed", response.status, await response.text().catch(() => ""));
    return response.ok;
  } catch (error) {
    console.error("Gift email delivery failed", error);
    return false;
  }
}

/** paystack webhook: HMAC-SHA512 of the raw body with the secret key. */
async function paystackWebhook(request, env) {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret?.startsWith("sk_")) return reply({ error: "Naira checkout is not configured" }, request, { status: 503 });

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";
  if (!signature || !same(signature, await paystackSignature(raw, secret))) {
    return reply({ error: "Invalid signature" }, request, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid payload" }, request, { status: 400 });
  }

  if (event.event !== "charge.success") return reply({ received: true }, request);

  const reference = String(event.data?.reference || "");
  if (reference.startsWith("bpo_")) {
    // Keep provider retries available until bulk fulfillment and recovery are safe.
    return reply({ error: "Bulk payment fulfillment is temporarily unavailable." }, request, { status: 503 });
  }
  if (!validSessionId(reference)) return reply({ error: "Invalid reference" }, request, { status: 400 });

  return verifyAndRecordPaystack(request, env, reference, event.data?.customer?.email);
}

// Shared by the signed webhook and the explicitly local test recovery path.
// Always verify with Paystack before creating or binding an entitlement.
async function verifyAndRecordPaystack(request, env, reference, fallbackEmail = "") {
  const secret = env.PAYSTACK_SECRET_KEY;
  await ensure(env);
  const existing = await env.OBI_DB.prepare("SELECT checkout_session_id FROM purchases WHERE checkout_session_id=?").bind(reference).first();
  if (existing) return reply({ received: true, duplicate: true }, request);

  // Never grant on the webhook payload alone — verify with Paystack.
  const verifyResponse = await fetch(`${paystackApi(env)}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const verified = await verifyResponse.json().catch(() => ({}));
  const tx = verified?.data;
  if (!verifyResponse.ok || !verified.status || tx?.status !== "success" || tx?.reference !== reference) {
    return reply({ error: "Payment could not be verified" }, request, { status: 400 });
  }
  if (String(tx.currency || "").toUpperCase() !== "NGN" || Number(tx.amount) !== NAIRA_PRICE * 100) {
    return reply({ error: "Payment amount does not match the edition price" }, request, { status: 400 });
  }

  const email = String(tx.customer?.email || fallbackEmail || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return reply({ error: "Missing purchaser email" }, request, { status: 400 });

  let metadata = tx.metadata ?? null;
  if (typeof metadata === "string") {
    try { metadata = JSON.parse(metadata); } catch { metadata = null; }
  }
  const gift = giftDetails(metadata);
  if (metadata?.product_sku !== SKU || !/^[a-f0-9]{64}$/.test(metadata?.device_hash || "")) {
    return reply({ error: "Payment metadata does not match the edition." }, request, { status: 400 });
  }
  const now = new Date().toISOString();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare("INSERT OR IGNORE INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at) VALUES (?,?,?,?,?,?,?,?)").bind(reference, String(tx.id ?? ""), email, Number(tx.amount), "NGN", SKU, "active", now),
    env.OBI_DB.prepare("INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)").bind(reference, gift ? "UNBOUND" : metadata.device_hash, now),
  ]);
  if (gift) {
    await saveGiftOrder(env, gift, reference, email);
    await sendGiftCodeEmail(env, gift);
  }

  return reply({ received: true, ...(gift ? { gift: gift.code } : {}) }, request);
}

async function recordCheckoutCompletion(event, env) {
  const session = event.data?.object;
  if (event?.type !== EVENT || !event.id?.startsWith("evt_") || !expected(session)) return { received: true, ignored: true };
  await ensure(env);
  const now = new Date().toISOString();
  const email = String(session.customer_details?.email || session.customer_email || session.metadata?.purchaser_email || "").toLowerCase() || null;
  const deviceHash = session.metadata.device_hash;
  const gift = giftDetails(session.metadata);
  // A gift belongs to the recipient, not the buyer's browser. Leave the
  // device slot unbound until the recipient redeems the code.
  const deviceValue = gift ? "UNBOUND" : deviceHash;
  const result = await env.OBI_DB.batch([
    env.OBI_DB.prepare("INSERT OR IGNORE INTO webhook_events (event_id,event_type,status,received_at) VALUES (?,?,?,?)").bind(event.id, EVENT, "processed", now),
    env.OBI_DB.prepare("INSERT OR IGNORE INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at) VALUES (?,?,?,?,?,?,?,?)").bind(session.id, typeof session.payment_intent === "string" ? session.payment_intent : null, email, PRICE, "usd", SKU, "active", now),
    env.OBI_DB.prepare("INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)").bind(session.id, deviceValue, now),
  ]);
  if (gift) {
    await saveGiftOrder(env, gift, session.id, email);
    await sendGiftCodeEmail(env, gift);
  }
  return {
    received: true,
    event: result[0].meta.changes ? "processed" : "duplicate",
    entitlement: result[1].meta.changes ? "granted" : "already_granted",
    ...(gift ? { gift: gift.code } : {}),
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
  await ensure(env);
  const localTest = localPaystackTest(request, env) && new URL(request.url).protocol === "http:";
  const rateLimited = (await enforceLimit(request, env, "claim", localTest ? "claim-ip-local-test" : "claim-ip", clientIp(request)))
    || (await enforceLimit(request, env, "claim", localTest ? "claim-device-local-test" : "claim-device", deviceToken));
  if (rateLimited) return rateLimited;
  let purchased = await activePurchase(env, sessionId);
  if (!purchased && sessionId.startsWith("obi_") && localPaystackTest(request, env)) {
    const verified = await verifyAndRecordPaystack(request, env, sessionId);
    if (verified.ok) purchased = await activePurchase(env, sessionId);
  }
  const pendingGift = await env.OBI_DB.prepare("SELECT status FROM gift_orders WHERE checkout_session_id=?").bind(sessionId).first();
  if (pendingGift?.status === "active") {
    return reply({ error: "This edition is a gift. Ask the sender for the gift code, then redeem it at /redeem.html." }, request, { status: 409 });
  }
  if (!purchased) return reply({ error: "Purchase is not ready yet. Please retry shortly." }, request, { status: 404 });
  const deviceHash = await hashDeviceToken(deviceToken);
  const existing = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(sessionId).first();
  if (existing && existing.device_hash !== "UNBOUND" && !same(existing.device_hash, deviceHash)) return reply({ error: "This edition is already active on another device." }, request, { status: 409 });
  if (!existing) {
    await env.OBI_DB.prepare("INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)").bind(sessionId, deviceHash, new Date().toISOString()).run();
  } else if (existing.device_hash === "UNBOUND") {
    await env.OBI_DB.prepare("UPDATE reader_devices SET device_hash=?, claimed_at=? WHERE checkout_session_id=? AND device_hash='UNBOUND'").bind(deviceHash, new Date().toISOString(), sessionId).run();
  }
  const actual = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(sessionId).first();
  if (!actual || !same(actual.device_hash, deviceHash)) return reply({ error: "This edition is already active on another device." }, request, { status: 409 });
  return reply({ access: true, deviceBound: true }, request);
}

async function redeemLocalBulk(request, env) {
  if (!bulkLocalEnabled(request, env)) return json({ error: "Not found" }, { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin || !(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return reply({ error: "Request not allowed." }, request, { status: 403 });
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ error: "Sign in to your reader account first." }, request, { status: 401 });
  const rateLimited = (await enforceLimit(request, env, "bulk-local", "bulk-local-ip", clientIp(request)))
    || (await enforceLimit(request, env, "bulk-local", "bulk-local-account", account.id));
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({}));
  if (!validDeviceToken(body.device_token)) return reply({ error: "A secure reader device is required." }, request, { status: 400 });
  const result = await redeemBulkLocal(env, account, body.code, await hashDeviceToken(body.device_token));
  return reply(result.body, request, { status: result.status });
}

async function createBulkOrder(request, env) {
  const origin = request.headers.get('origin');
  const allowed = origin && (allowedOrigins.has(origin) || devOrigins.has(origin));
  if (!allowed) return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return reply({ error: "Request not allowed." }, request, { status: 415 });
  const body = await request.json().catch(() => ({}));
  const rateLimited = await enforceLimit(request, env, "bulk-order", "bulk-order-ip", clientIp(request));
  if (rateLimited) return rateLimited;
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ error: "Sign in to your account first." }, request, { status: 401 });
  const email = account.email;
  const quantity = Number(body.quantity);
  const provider = String(body.provider || '').toLowerCase();
  if (!['paystack', 'stripe'].includes(provider)) return reply({ error: "Choose a supported payment gateway." }, request, { status: 400 });
  // Buyer-controlled discounts are never approvals. An authenticated admin
  // approval workflow must be implemented before discounts are accepted.
  if (body.discount != null) return reply({ error: "Bulk discounts require administrator approval." }, request, { status: 403 });
  const result = await createBulkOrderCheckout(env, email, quantity, provider, null, account.email);
  return reply(result.body, request, { status: result.status });
}

async function verifyBulkOrder(request, env) {
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ error: "Sign in to your account first." }, request, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = body.order_id || body.id;
  if (!/^bprod_[a-f0-9]{32}$/.test(id || '')) return reply({ error: "Invalid order." }, request, { status: 400 });
  const order = await env.OBI_DB.prepare('SELECT buyer_email FROM bulk_orders WHERE id=?').bind(id).first();
  if (!order || order.buyer_email !== account.email) return reply({ error: "Order not found." }, request, { status: 404 });
  const verified = await env.OBI_DB.prepare('SELECT email_verified FROM obi_accounts WHERE id=?').bind(account.id).first();
  if (verified?.email_verified !== 1) return reply({ error: "Verify your account email first." }, request, { status: 403 });
  const result = await verifyBulkOrderPayment(env, id);
  return reply(result.body, request, { status: result.status });
}

async function claimBulkOrderEndpoint(request, env) {
  const origin = request.headers.get('origin');
  const allowed = origin && (allowedOrigins.has(origin) || devOrigins.has(origin));
  if (!allowed) return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ error: "Sign in to your reader account first." }, request, { status: 401 });
  const rateLimited = (await enforceLimit(request, env, "bulk-order", "bulk-order-ip", clientIp(request)))
    || (await enforceLimit(request, env, "bulk-order", "bulk-order-account", account.id));
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({}));
  if (!validDeviceToken(body.device_token)) return reply({ error: "A secure reader device is required." }, request, { status: 400 });
  const result = await claimBulkOrder(env, account, body.code, await hashDeviceToken(body.device_token));
  return reply(result.body, request, { status: result.status });
}

// A transfer requires both an authenticated account and a fresh code sent to
// the purchaser (or redeemed gift recipient). No device token leaves the server.
async function transferOwner(env, sessionId, email) {
  return env.OBI_DB.prepare("SELECT p.checkout_session_id FROM purchases p LEFT JOIN gift_orders g ON g.checkout_session_id=p.checkout_session_id WHERE p.checkout_session_id=? AND p.status='active' AND ((g.checkout_session_id IS NULL AND p.purchaser_email=?) OR (g.status='redeemed' AND g.recipient_email=?))").bind(sessionId, email, email).first();
}

function transferOriginAllowed(request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const sameLocalOrigin = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && origin === url.origin;
  return !origin || allowedOrigins.has(origin) || devOrigins.has(origin) || sameLocalOrigin || (origin === "http://127.0.0.1:8787" && url.hostname === "127.0.0.1");
}

async function startDeviceTransfer(request, env) {
  if (!transferOriginAllowed(request)) return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ error: "Please sign in before moving your edition." }, request, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!validSessionId(body.session_id) || !validDeviceToken(body.device_token)) return reply({ error: "Invalid transfer request." }, request, { status: 400 });
  if (!(await transferOwner(env, body.session_id, account.email))) return reply({ error: "No active edition was found for this account." }, request, { status: 403 });
  const from = env.ACCOUNT_FROM_EMAIL || env.GIFT_FROM_EMAIL;
  const url = new URL(request.url);
  const localTest = env.OBI_LOCAL_TRANSFER_TEST === '1' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  const emailConfigured = env.RESEND_API_KEY?.startsWith("re_") && Boolean(from);
  if (!emailConfigured && !localTest) return reply({ error: "Email verification is not configured. Please contact support to move your edition." }, request, { status: 503 });
  const recent = await env.OBI_DB.prepare("SELECT count(*) AS count FROM device_transfer_challenges WHERE account_id=? AND created_at>?").bind(account.id, new Date(Date.now() - 3600000).toISOString()).first();
  if (Number(recent?.count || 0) >= 5) return reply({ error: "Too many verification requests. Please try again later." }, request, { status: 429 });
  const device = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(body.session_id).first();
  if (!device || device.device_hash === "UNBOUND") return reply({ error: "This edition is ready to claim. Please retry the reader." }, request, { status: 409 });
  const id = `transfer_${await randomToken(24)}`;
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const code = String(bytes[0] % 100000000).padStart(8, "0");
  const now = new Date();
  await env.OBI_DB.prepare("INSERT INTO device_transfer_challenges (id,account_id,checkout_session_id,old_device_hash,new_device_hash,code_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, account.id, body.session_id, device.device_hash, await hashDeviceToken(body.device_token), await hashDeviceToken(`${id}:${code}`), now.toISOString(), new Date(now.getTime() + 600000).toISOString()).run();
  if (localTest && !emailConfigured) return reply({ challengeId: id, localTest: true, testCode: code, message: 'Local test only: use the verification code shown below.' }, request);
  try {
    const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [account.email], subject: "Your OBI-ISM verification code", text: `Your code to move your OBI-ISM edition is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.` }) });
    if (!sent.ok) throw new Error("Email provider rejected request");
  } catch {
    await env.OBI_DB.prepare("UPDATE device_transfer_challenges SET consumed_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
    return reply({ error: "Could not send the verification code. Please try again or contact support." }, request, { status: 503 });
  }
  return reply({ challengeId: id, message: "A verification code was sent to your account email." }, request);
}

async function confirmDeviceTransfer(request, env) {
  if (!transferOriginAllowed(request)) return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ error: "Please sign in before moving your edition." }, request, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!/^transfer_[A-Za-z0-9]{12,48}$/.test(body.challenge_id || "") || !/^\d{8}$/.test(body.code || "") || !validDeviceToken(body.device_token)) return reply({ error: "Enter the eight-digit verification code." }, request, { status: 400 });
  const now = new Date().toISOString();
  const challenge = await env.OBI_DB.prepare("UPDATE device_transfer_challenges SET attempts=attempts+1 WHERE id=? AND account_id=? AND consumed_at IS NULL AND expires_at>? AND attempts<5 RETURNING *").bind(body.challenge_id, account.id, now).first();
  if (!challenge || !same(challenge.code_hash, await hashDeviceToken(`${body.challenge_id}:${body.code}`)) || !same(challenge.new_device_hash, await hashDeviceToken(body.device_token))) return reply({ error: "The code is invalid or expired. Request a new code if needed." }, request, { status: 400 });
  if (!(await transferOwner(env, challenge.checkout_session_id, account.email))) return reply({ error: "No active edition was found for this account." }, request, { status: 403 });
  const consumed = await env.OBI_DB.prepare("UPDATE device_transfer_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL RETURNING id").bind(now, challenge.id).first();
  if (!consumed) return reply({ error: "This code has already been used." }, request, { status: 409 });
  const result = await env.OBI_DB.batch([
    env.OBI_DB.prepare("UPDATE reader_devices SET device_hash=?, claimed_at=? WHERE checkout_session_id=? AND device_hash=? AND EXISTS (SELECT 1 FROM purchases WHERE checkout_session_id=? AND status='active')").bind(challenge.new_device_hash, now, challenge.checkout_session_id, challenge.old_device_hash, challenge.checkout_session_id),
    env.OBI_DB.prepare("INSERT INTO device_transfer_audit (id,account_id,checkout_session_id,created_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM reader_devices WHERE checkout_session_id=? AND device_hash=?)").bind(`audit_${await randomToken(18)}`, account.id, challenge.checkout_session_id, now, challenge.checkout_session_id, challenge.new_device_hash),
  ]);
  if (!result[0]?.meta?.changes) return reply({ error: "The active device changed. Please start again." }, request, { status: 409 });
  return reply({ access: true, message: "Your edition has been moved to this browser." }, request);
}

/** Buyer's confirmation page: returns the gift code once payment has landed. */
async function giftStatus(request, env) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!validSessionId(sessionId)) return reply({ error: "Invalid gift reference" }, request, { status: 400 });
  await ensure(env);
  const gift = await env.OBI_DB.prepare(
    "SELECT code, recipient_name, recipient_email, message, status, created_at, redeemed_at FROM gift_orders WHERE checkout_session_id=?",
  ).bind(sessionId).first();
  if (!gift) {
    return reply({ pending: true, error: "Your gift is still being prepared. Please retry in a moment." }, request, { status: 404 });
  }
  return reply({
    paid: Boolean(await activePurchase(env, sessionId)),
    gift: {
      code: gift.code,
      recipientName: gift.recipient_name,
      recipientEmail: gift.recipient_email,
      message: gift.message || "",
      status: gift.status,
      createdAt: gift.created_at,
      redeemedAt: gift.redeemed_at || null,
    },
  }, request);
}

/** Recipient unlocks the purchased edition with the code + the email it was sent to. */
async function redeemGift(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = normalizeGiftCode(body.code);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const deviceToken = body.device_token;
  if (!validGiftCode(code)) return reply({ error: "Enter a valid gift code, for example OBI-7K2M-P9QX-4HWD." }, request, { status: 400 });
  if (!validEmail(email)) return reply({ error: "Enter the email address this gift was sent to." }, request, { status: 400 });
  if (!validDeviceToken(deviceToken)) return reply({ error: "A secure reader device is required" }, request, { status: 400 });
  await ensure(env);
  const rateLimited = (await enforceLimit(request, env, "gift-redeem", "gift-redeem-ip", clientIp(request)))
    || (await enforceLimit(request, env, "gift-redeem", "gift-redeem-code", code));
  if (rateLimited) return rateLimited;

  const gift = await env.OBI_DB.prepare(
    "SELECT code, checkout_session_id, recipient_email, status FROM gift_orders WHERE code=?",
  ).bind(code).first();
  if (!gift) return reply({ error: "That gift code was not found. Check the code and try again." }, request, { status: 404 });
  if (gift.status === "revoked") return reply({ error: "This gift code has been cancelled. Contact support for help." }, request, { status: 403 });
  if (gift.recipient_email !== email) {
    return reply({ error: "Use the email address this gift was sent to. The code only works for that inbox." }, request, { status: 403 });
  }
  if (!(await activePurchase(env, gift.checkout_session_id))) {
    return reply({ error: "This gift payment is not active yet. Please retry in a moment." }, request, { status: 409 });
  }

  const deviceHash = await hashDeviceToken(deviceToken);
  const bound = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(gift.checkout_session_id).first();
  const boundElsewhere = bound && bound.device_hash !== "UNBOUND" && !same(bound.device_hash, deviceHash);

  if (gift.status === "redeemed") {
    if (bound && same(bound.device_hash, deviceHash)) {
      return reply({ session_id: gift.checkout_session_id, alreadyRedeemed: true }, request);
    }
    if (boundElsewhere) return reply({ error: "This gift has already been opened on another device." }, request, { status: 409 });
    // A prior redemption may have been interrupted before the device was bound.
  } else if (gift.status !== "active") {
    return reply({ error: "This gift code is no longer available." }, request, { status: 409 });
  } else {
    const claimed = await env.OBI_DB.prepare(
      "UPDATE gift_orders SET status='redeemed', redeemed_at=? WHERE code=? AND status='active'",
    ).bind(new Date().toISOString(), code).run();
    if ((claimed?.meta?.changes ?? 0) === 0) {
      return reply({ error: "This gift code has already been redeemed." }, request, { status: 409 });
    }
  }

  if (!bound) {
    await env.OBI_DB.prepare("INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)")
      .bind(gift.checkout_session_id, deviceHash, new Date().toISOString()).run();
  } else if (bound.device_hash === "UNBOUND") {
    await env.OBI_DB.prepare("UPDATE reader_devices SET device_hash=?, claimed_at=? WHERE checkout_session_id=? AND device_hash='UNBOUND'")
      .bind(deviceHash, new Date().toISOString(), gift.checkout_session_id).run();
  }

  return reply({ session_id: gift.checkout_session_id, redeemed: true }, request);
}

async function narration(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  if (!env.ELEVENLABS_API_KEY?.startsWith("sk_")) return reply({ error: "Narration is not configured" }, request, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const sessionId = body.session_id;
  const deviceToken = body.device_token;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken) || !text || text.length > 8000) {
    return reply({ error: "Invalid narration request" }, request, { status: 400 });
  }
  await ensure(env);
  const rateLimited = await enforceLimit(request, env, "narration", "narration-device", deviceToken);
  if (rateLimited) return rateLimited;
  if (!(await activePurchase(env, sessionId))) return reply({ error: "Reader access is not active" }, request, { status: 403 });
  const deviceHash = await hashDeviceToken(deviceToken);
  const boundDevice = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(sessionId).first();
  if (!boundDevice || !same(boundDevice.device_hash, deviceHash)) return reply({ error: "Reader is not authorized on this device" }, request, { status: 403 });
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${NARRATOR_VOICE_ID}`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_v4", voice_settings: { stability: 0.58, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } }),
  });
  if (!response.ok) return reply({ error: "Narration service is temporarily unavailable" }, request, { status: 502 });
  return new Response(response.body, { status: 200, headers: { ...cors(request), "content-type": "audio/mpeg", "cache-control": "private, no-store" } });
}

function sectionMetadata(section) {
  const paragraphs = JSON.parse(section.paragraphs_json);
  const firstParagraph = paragraphs.find((paragraph) => paragraph.length > 80) ?? paragraphs[0] ?? "";
  return {
    id: section.section_id,
    label: section.label,
    title: section.title,
    kind: section.kind,
    summary: firstParagraph.length > 180 ? `${firstParagraph.slice(0, 177).trimEnd()}…` : firstParagraph,
  };
}

async function reader(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const deviceToken = request.headers.get("x-obi-device-token") || url.searchParams.get("device_token");
  const sectionId = url.searchParams.get("section_id");
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken)) return reply({ error: "Reader access is required" }, request, { status: 403 });
  await ensure(env);
  const ipLimited = await enforceLimit(request, env, "reader", "reader-ip", clientIp(request));
  if (ipLimited) return ipLimited;
  if (!(await activePurchase(env, sessionId))) return reply({ error: "Reader access is not active" }, request, { status: 403 });
  const deviceHash = await hashDeviceToken(deviceToken);
  const boundDevice = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(sessionId).first();
  if (!boundDevice || !same(boundDevice.device_hash, deviceHash)) return reply({ error: "Reader is not authorized on this device" }, request, { status: 403 });

  // Only licensed devices reach the content counters. Section requests get a
  // tighter scrape budget than catalogue/metadata refreshes.
  const deviceLimited = (await enforceLimit(request, env, "reader", "reader-device", deviceToken))
    || (sectionId ? await enforceLimit(request, env, "reader", "reader-sections", deviceToken) : null);
  if (deviceLimited) return deviceLimited;

  if (sectionId) {
    const section = await env.OBI_DB.prepare("SELECT section_id, label, title, kind, paragraphs_json FROM book_sections WHERE section_id=?").bind(sectionId).first();
    if (!section) return reply({ error: "This section is not available." }, request, { status: 404 });
    return reply({ chapter: { ...sectionMetadata(section), paragraphs: JSON.parse(section.paragraphs_json) } }, request);
  }

  const sections = await env.OBI_DB.prepare("SELECT section_id, label, title, kind, paragraphs_json FROM book_sections ORDER BY position ASC").all();
  if (!sections.results?.length) return reply({ error: "The protected edition is being prepared. Please retry shortly." }, request, { status: 503 });
  return reply({
    title: "OBI-ISM",
    subtitle: "Building a Just Society Through Character",
    authors: "Eze Echesi & Mpamugo",
    chapters: sections.results.map(sectionMetadata),
  }, request);
}

export {
  expected as hasExpectedBookPayment,
  hashDeviceToken,
  validDeviceToken,
  validSessionId,
  validGiftCode,
  normalizeGiftCode,
  giftDetails,
  validSignature as verifyStripeSignature,
  recordCheckoutCompletion,
  consumeLimit,
  RATE_LIMITS,
};

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      // Never let an exception surface as an opaque Cloudflare 1101 page:
      // the browser cannot parse that, so the UI shows a generic failure.
      console.error("Unhandled worker error:", error && error.stack ? error.stack : error);
      return reply({ error: "The edition service hit an unexpected error. Please try again." }, request, { status: 500 });
    }
  },
};

async function handleRequest(request, env) {
    if (env.OBI_DEV_ORIGINS) {
      devOrigins.clear();
      String(env.OBI_DEV_ORIGINS).split(",").map((value) => value.trim()).filter(Boolean).forEach((value) => devOrigins.add(value));
    }
    const path = new URL(request.url).pathname;
    if (path === '/api/internal/local-mysql/account') {
      const { applyLocalMysqlAccount } = await import('./api/src/local-mysql-sync.js');
      return applyLocalMysqlAccount(request, env, ensure);
    }
    if (path.startsWith("/api/admin/")) return handleAdminAuth(request, env);
    if (request.method === "OPTIONS" && path.startsWith("/api/")) return new Response(null, {
      status: 204,
      headers: {
        ...cors(request),
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, x-obi-device-token",
      },
    });
    if (path === "/api/health") return json({ status: "ok", service: "obi-ism-payments" });
    // Production bulk payments remain unavailable pending security and payment review.
    // Local-only test endpoints remain separate.
    if (request.method === "POST" && ["/api/bulk", "/api/bulk/verify", "/api/bulk/claim"].includes(path)) {
      return reply({ error: "Bulk orders are not available yet." }, request, { status: 503 });
    }
    if (path === "/api/account/register" && request.method === "POST") return registerAccount(request, env);
    if (path === "/api/account/login" && request.method === "POST") return loginAccount(request, env);
    if (path === "/api/account/access" && request.method === "GET") return accountAccess(request, env);
    if (path === "/api/account/verify/request" && request.method === "POST") {
      const account = await accountFromRequest(request, env);
      if (!account) return reply({ error: "Sign in required" }, request, { status: 401 });
      await ensure(env);
      const from = env.ACCOUNT_FROM_EMAIL || env.GIFT_FROM_EMAIL;
      const emailConfigured = env.RESEND_API_KEY?.startsWith("re_") && Boolean(from);
      const url = new URL(request.url);
      const localTest = env.OBI_LOCAL_TRANSFER_TEST === '1' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
      if (!emailConfigured && !localTest) return reply({ error: "Email verification is not configured." }, request, { status: 503 });
      const recent = await env.OBI_DB.prepare("SELECT count(*) AS count FROM account_verification_challenges WHERE account_id=? AND created_at>?").bind(account.id, new Date(Date.now() - 3600000).toISOString()).first();
      if (Number(recent?.count || 0) >= 5) return reply({ error: "Too many verification requests. Please try again later." }, request, { status: 429 });
      const id = `verify_${await randomToken(24)}`;
      const bytes = crypto.getRandomValues(new Uint32Array(1));
      const code = String(bytes[0] % 100000000).padStart(8, "0");
      const now = new Date();
      await env.OBI_DB.prepare("INSERT INTO account_verification_challenges (id,account_id,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)").bind(id, account.id, await hashDeviceToken(`${id}:${code}`), now.toISOString(), new Date(now.getTime() + 600000).toISOString()).run();
      if (emailConfigured) {
        try {
          const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [account.email], subject: "Verify your OBI-ISM email", text: `Your verification code is ${code}. It expires in 10 minutes.` }) });
          if (!sent.ok) throw new Error("Email provider rejected request");
        } catch {
          await env.OBI_DB.prepare("UPDATE account_verification_challenges SET consumed_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
          return reply({ error: "Could not send the verification code. Please try again." }, request, { status: 503 });
        }
        return reply({ message: "Verification code sent." }, request);
      }
      return reply({ message: "Local test code", testCode: code }, request);
    }
    if (path === "/api/account/verify/confirm" && request.method === "POST") {
      const account = await accountFromRequest(request, env);
      if (!account) return reply({ error: "Sign in required" }, request, { status: 401 });
      await ensure(env);
      const body = await request.json().catch(() => ({}));
      const code = String(body.code || '').replace(/\D/g,'').slice(0,8);
      if (code.length !== 8) return reply({ error: "Invalid code" }, request, { status: 400 });
      const ch = await env.OBI_DB.prepare("SELECT * FROM account_verification_challenges WHERE account_id=? AND consumed_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(account.id, new Date().toISOString()).first();
      if (!ch) return reply({ error: "No valid challenge" }, request, { status: 400 });
      if (ch.attempts >= 5) return reply({ error: "Too many attempts" }, request, { status: 429 });
      if (!(await same(ch.code_hash, await hashDeviceToken(`${ch.id}:${code}`)))) {
        await env.OBI_DB.prepare("UPDATE account_verification_challenges SET attempts=attempts+1 WHERE id=?").bind(ch.id).run();
        return reply({ error: "Invalid code" }, request, { status: 400 });
      }
      await env.OBI_DB.batch([
        env.OBI_DB.prepare("UPDATE account_verification_challenges SET consumed_at=? WHERE id=?").bind(new Date().toISOString(), ch.id),
        env.OBI_DB.prepare("UPDATE obi_accounts SET email_verified=1 WHERE id=?").bind(account.id),
      ]);
      return reply({ verified: true }, request);
    }
    if (path === "/api/stripe/webhook") return webhook(request, env);
    if (path === "/api/paystack/webhook" && request.method === "POST") return paystackWebhook(request, env);
    if (path === "/api/checkout" && request.method === "POST") return checkout(request, env);
    if (path === "/api/bulk" && request.method === "POST") return createBulkOrder(request, env);
    if (path === "/api/bulk/verify" && request.method === "POST") return verifyBulkOrder(request, env);
    if (path === "/api/bulk/claim" && request.method === "POST") return claimBulkOrderEndpoint(request, env);
    if (path === "/api/bulk/local/redeem" && request.method === "POST") return redeemLocalBulk(request, env);
    if (path === "/api/gift" && request.method === "GET") return giftStatus(request, env);
    if (path === "/api/gift/redeem" && request.method === "POST") return redeemGift(request, env);
    if (path === "/api/reader/claim" && request.method === "POST") return claimReader(request, env);
    if (path === "/api/reader/transfer/start" && request.method === "POST") return startDeviceTransfer(request, env);
    if (path === "/api/reader/transfer/confirm" && request.method === "POST") return confirmDeviceTransfer(request, env);
    if (path === "/api/narration" && request.method === "POST") return narration(request, env);
    if (path === "/api/reader" && request.method === "GET") return reader(request, env);
    if (path === "/api/access" && request.method === "GET") {
      const sessionId = new URL(request.url).searchParams.get("session_id");
      if (!validSessionId(sessionId)) return reply({ access: false }, request, { status: 400 });
      return reply({ access: Boolean(await activePurchase(env, sessionId)) }, request);
    }
    return json({ error: "Not found" }, { status: 404 });
}
