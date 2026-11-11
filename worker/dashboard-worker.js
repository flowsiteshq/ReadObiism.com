import { validDeviceToken, validSessionId } from "./api/src/validation.js";
import { hashDeviceToken, same } from "./api/src/security.js";
import { handleAdminAuth } from "./api/src/admin-auth.js";
import { bulkLocalEnabled, redeemBulkLocal } from "./api/src/bulk-local.js";
import {
  createBulkOrderCheckout,
  verifyBulkOrderPayment,
  claimBulkOrder,
  ensureBulkOrders,
  seatsForOrder,
  assignBulkSeat,
  revokeBulkSeat,
  claimBulkSeat,
} from "./api/src/bulk-orders.js";
import {
  USD_PRICE_CENTS as PRICE,
  NGN_PRICE_KOBO,
  EDITION_SKU as SKU,
} from "./api/src/pricing.js";
import { getPricing, getAccessDays, accessExpiry } from "./api/src/pricing-store.js";
import { ensureEditions, liveEdition, editionByNumber } from "./api/src/edition-store.js";
import { getFeatureFlags, isFeatureEnabled } from "./api/src/feature-flags.js";
import {
  verificationEmail,
  giftCodeEmail,
  deviceTransferCodeEmail,
  deviceMovedEmail,
} from "./api/src/email-templates.js";
import { ensureDeviceSchema } from "./api/src/device-schema.js";
import { ensureFeedbackSchema } from "./api/src/feedback-schema.js";
import { encodeWatermark } from "./api/src/watermark.js";
import { ensureReaderStateSchema } from "./api/src/reader-state-schema.js";
import { ensurePasswordResetSchema, sendPasswordReset } from "./api/src/password-reset.js";
import { bytesToBase64, passwordDigest, passwordSalt } from "./api/src/passwords.js";

// OBI-ISM production payment and entitlement worker.
// The full edition is compiled into this Worker at deployment time; it is never included in public site files.
const NAIRA_PRICE = NGN_PRICE_KOBO / 100;
const EVENT = "checkout.session.completed";
const NARRATOR_VOICE_ID = "F18yf5BixLZCvKiiW0yJ"; // Steven — West African Narrator
// Device moves are deliberately inconvenient: one week between moves and a
// rolling 180-day cap. Support can handle legitimate edge cases manually.
const TRANSFER_COOLDOWN_MS = 7 * 86400000;
const TRANSFER_MAX_WINDOW_MS = 180 * 86400000;
const TRANSFER_MAX_PER_WINDOW = 3;

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
  "feedback-ip": { limit: 20, windowSeconds: 3600 },
  "feedback-device": { limit: 15, windowSeconds: 3600 },
  "state-ip": { limit: 3600, windowSeconds: 3600 },
  "state-device": { limit: 3600, windowSeconds: 3600 },
  "transfer-auth": { limit: 5, windowSeconds: 900 },
  // Separate, more generous buckets for the loopback Paystack test Worker.
  "claim-ip-local-test": { limit: 200, windowSeconds: 3600 },
  "claim-device-local-test": { limit: 100, windowSeconds: 3600 },
  "login-ip": { limit: 25, windowSeconds: 900 },
  "login-account": { limit: 10, windowSeconds: 900 },
  "password-reset-ip": { limit: 10, windowSeconds: 900 },
  "password-reset-account": { limit: 5, windowSeconds: 3600 },
  "password-reset-confirm-ip": { limit: 20, windowSeconds: 900 },
  "password-change-ip": { limit: 10, windowSeconds: 900 },
  "google-ip": { limit: 20, windowSeconds: 900 },
  "google-account": { limit: 10, windowSeconds: 900 },
  "register-ip": { limit: 6, windowSeconds: 3600 },
  "register-email": { limit: 3, windowSeconds: 3600 },
  "register-phone": { limit: 3, windowSeconds: 3600 },
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
CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, reader_name TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL, metadata_json TEXT);
CREATE TABLE IF NOT EXISTS device_transfer_challenges (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, old_device_hash TEXT NOT NULL, new_device_hash TEXT NOT NULL, code_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT);
CREATE INDEX IF NOT EXISTS device_transfer_challenges_account_idx ON device_transfer_challenges(account_id, created_at);
CREATE TABLE IF NOT EXISTS device_transfer_audit (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, old_device_hash TEXT, new_device_hash TEXT, metadata_json TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS device_transfer_audit_session_idx ON device_transfer_audit(checkout_session_id, created_at);
CREATE TABLE IF NOT EXISTS gift_orders (code TEXT PRIMARY KEY, checkout_session_id TEXT UNIQUE NOT NULL, buyer_email TEXT NOT NULL, recipient_name TEXT NOT NULL, recipient_email TEXT NOT NULL, message TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, redeemed_at TEXT);
CREATE INDEX IF NOT EXISTS gift_orders_email_idx ON gift_orders(recipient_email);
CREATE INDEX IF NOT EXISTS gift_orders_session_idx ON gift_orders(checkout_session_id);
CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(section_id, paragraph_index UNINDEXED, content, tokenize = 'unicode61');
CREATE INDEX IF NOT EXISTS purchases_email_idx ON purchases(purchaser_email);
CREATE TABLE IF NOT EXISTS obi_accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, phone TEXT, phone_verified INTEGER NOT NULL DEFAULT 0, google_sub TEXT, auth_provider TEXT NOT NULL DEFAULT 'password', created_at TEXT NOT NULL, last_signed_in TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS obi_account_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON obi_account_sessions(account_id);
CREATE TABLE IF NOT EXISTS account_verification_challenges (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, code_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT);
CREATE INDEX IF NOT EXISTS account_verification_challenges_account_idx ON account_verification_challenges(account_id, created_at);
CREATE TABLE IF NOT EXISTS account_password_resets (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, code_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT);
CREATE INDEX IF NOT EXISTS account_password_resets_account_idx ON account_password_resets(account_id, created_at);
CREATE TABLE IF NOT EXISTS request_limits (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS abuse_events (id TEXT PRIMARY KEY, route TEXT NOT NULL, limit_name TEXT NOT NULL, identity_hash TEXT NOT NULL, retry_after INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS abuse_events_created_idx ON abuse_events(created_at);
CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT);`;

const encoder = new TextEncoder();
const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
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
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        vary: "Origin",
      }
    : {};
};
const reply = (data, request, init = {}) =>
  json(data, {
    ...init,
    headers: { ...cors(request), ...(init.headers || {}) },
  });
const hex = (value) =>
  [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

async function validSignature(body, header, secret) {
  if (!header || !secret?.startsWith("whsec_")) return false;
  const values = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = Number(values.t);
  if (
    !Number.isInteger(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 ||
    !values.v1
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return same(
    values.v1,
    hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`))),
  );
}

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("CF-Connecting-IP") ||
    (forwarded ? forwarded.split(",")[0].trim() : "") ||
    "unknown"
  );
}

/**
 * Audit-only device context. IP is hashed, never stored raw. IP and geography
 * are risk signals, not hard binding keys: mobile networks and NAT change them
 * legitimately. They must never be used as the sole access gate.
 */
async function requestDeviceMetadata(request) {
  const cf = request.cf || {};
  const userAgent = String(request.headers.get("user-agent") || "").slice(0, 300);
  const headerPlatform = String(request.headers.get("sec-ch-ua-platform") || "")
    .replace(/"/g, "")
    .trim()
    .slice(0, 40);
  const platform =
    headerPlatform ||
    (/android/i.test(userAgent)
      ? "Android"
      : /iphone|ipad|ios/i.test(userAgent)
        ? "iOS"
        : /windows/i.test(userAgent)
          ? "Windows"
          : /macintosh|mac os/i.test(userAgent)
            ? "macOS"
            : "Unknown");
  const mobile =
    request.headers.get("sec-ch-ua-mobile") === "?1" ||
    /mobile|android|iphone|ipad/i.test(userAgent);
  return {
    ipHash: await hashDeviceToken(clientIp(request)),
    country: String(cf.country || "").slice(0, 2),
    city: String(cf.city || "").slice(0, 80),
    region: String(cf.region || "").slice(0, 80),
    asn: cf.asn ? Number(cf.asn) : null,
    platform,
    mobile: Boolean(mobile),
    userAgent,
  };
}

/** Opportunistic maintenance so the counters table cannot grow forever. */
async function trimExpiredLimits(env, nowSeconds) {
  limitCallCount += 1;
  if (limitCallCount % 500 !== 0) return;
  try {
    const statement = env.OBI_DB.prepare("DELETE FROM request_limits WHERE window_start < ?").bind(
      nowSeconds - 86400,
    );
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
  if (!config || !env?.OBI_DB)
    return { allowed: true, remaining: 0, retryAfter: 0, identityHash: "" };

  const identityHash = await hashDeviceToken(String(identity || "anonymous"));
  const windowStart = nowSeconds - (nowSeconds % config.windowSeconds);
  await trimExpiredLimits(env, nowSeconds);
  try {
    const row = await env.OBI_DB.prepare(
      "INSERT INTO request_limits (bucket, window_start, count) VALUES (?,?,1) " +
        "ON CONFLICT(bucket) DO UPDATE SET " +
        "count = CASE WHEN request_limits.window_start = excluded.window_start THEN request_limits.count + 1 ELSE 1 END, " +
        "window_start = excluded.window_start RETURNING count",
    )
      .bind(`${limitName}:${identityHash}`, windowStart)
      .first();
    const count = Number(row?.count ?? 1);
    if (count > config.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, windowStart + config.windowSeconds - nowSeconds),
        identityHash,
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, config.limit - count),
      retryAfter: 0,
      identityHash,
    };
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
    ).bind(
      `abuse_${await randomToken(12)}`,
      route,
      limitName,
      identityHash,
      retryAfter,
      new Date().toISOString(),
    );
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
    {
      error: "Too many requests. Please wait a moment and try again.",
      retryAfter: result.retryAfter,
    },
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
// Phone accounts use a synthetic internal address. That address is an
// account key, not a mailbox, so it can never be used as a payment receipt.
const validReceiptEmail = (value) => validEmail(value) && !/@phone\.obiism\.local$/i.test(value);

const publicOrigin = (env) =>
  env.OBI_PUBLIC_APP_URL === "https://readobiism.com"
    ? env.OBI_PUBLIC_APP_URL
    : "https://readobiism.com";

// Local checkout testing never enables this behavior for a deployed Worker or
// a live Paystack key. A local return address also keeps test purchases in the
// browser origin that started the checkout.
function localPaystackTest(request, env) {
  const host = new URL(request.url).hostname;
  return (
    (host === "127.0.0.1" || host === "localhost") &&
    env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")
  );
}

const paystackApi = (env) =>
  String(env.PAYSTACK_API_BASE || "https://api.paystack.co").replace(/\/+$/, "");

function paystackReference() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `obi_${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

async function paystackSignature(body, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
}

async function ensure(env) {
  if (!env.OBI_DB) throw new Error("OBI_DB binding unavailable");
  await env.OBI_DB.exec(schema);
  await ensureAccountSchema(env);
  await ensureDeviceSchema(env);
  await ensureFeedbackSchema(env);
  await ensurePurchaseSchema(env);
  await ensureReaderStateSchema(env);
  await ensurePasswordResetSchema(env);
  await ensureEditions(env);
}

// Databases created before email verification shipped have an obi_accounts
// table without email_verified. CREATE TABLE IF NOT EXISTS never adds columns,
// so registration, verification and bulk claims would fail with
// "no such column: email_verified". Repair the column once per isolate. Two
// cold isolates can race here, so a duplicate-column result is treated as done.
const repairedAccountSchemas = new WeakSet();
async function ensureAccountSchema(env) {
  if (repairedAccountSchemas.has(env.OBI_DB)) return;
  const columns = await env.OBI_DB.prepare("PRAGMA table_info(obi_accounts)").bind().all();
  const names = new Set((columns.results || []).map((column) => column.name));
  if (!names.has("email_verified")) {
    try {
      await env.OBI_DB.prepare(
        "ALTER TABLE obi_accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
      )
        .bind()
        .run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error)))
        throw error;
    }
  }
  if (!names.has("google_sub")) {
    try {
      await env.OBI_DB.prepare("ALTER TABLE obi_accounts ADD COLUMN google_sub TEXT").bind().run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error)))
        throw error;
    }
  }
  if (!names.has("auth_provider")) {
    try {
      await env.OBI_DB.prepare(
        "ALTER TABLE obi_accounts ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'",
      )
        .bind()
        .run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error)))
        throw error;
    }
  }
  if (!names.has("phone")) {
    try {
      await env.OBI_DB.prepare("ALTER TABLE obi_accounts ADD COLUMN phone TEXT").bind().run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error)))
        throw error;
    }
  }
  if (!names.has("phone_verified")) {
    try {
      await env.OBI_DB.prepare(
        "ALTER TABLE obi_accounts ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0",
      )
        .bind()
        .run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error)))
        throw error;
    }
  }
  try {
    await env.OBI_DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS obi_accounts_phone_idx ON obi_accounts(phone) WHERE phone IS NOT NULL",
    )
      .bind()
      .run();
  } catch {
    /* Duplicate or unsupported partial index is non-fatal. */
  }
  try {
    await env.OBI_DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS obi_accounts_google_sub_idx ON obi_accounts(google_sub) WHERE google_sub IS NOT NULL",
    )
      .bind()
      .run();
  } catch {
    /* Duplicate or unsupported partial index is non-fatal. */
  }
  repairedAccountSchemas.add(env.OBI_DB);
}

const repairedPurchaseSchemas = new WeakSet();
async function reindexSearchIndex(env) {
  await env.OBI_DB.prepare("DELETE FROM search_index").run();
  const sections = await env.OBI_DB.prepare("SELECT section_id, paragraphs_json FROM book_sections").all();
  let inserted = 0;
  for (const row of sections.results || []) {
    let paragraphs = [];
    try { paragraphs = JSON.parse(row.paragraphs_json); } catch { continue; }
    if (!Array.isArray(paragraphs)) continue;
    for (let i = 0; i < paragraphs.length; i++) {
      const text = String(paragraphs[i] || "").replace(/<[^>]*>/g, "").trim();
      if (text.length === 0) continue;
      await env.OBI_DB.prepare("INSERT INTO search_index (section_id, paragraph_index, content) VALUES (?, ?, ?)")
        .bind(row.section_id, i, text).run();
      inserted += 1;
    }
  }
  return { inserted };
}

async function ensureSearchIndex(env) {
  if (!env.OBI_DB) return;
  try {
    const count = await env.OBI_DB.prepare("SELECT COUNT(*) AS n FROM search_index").first();
    if (Number(count?.n || 0) === 0) await reindexSearchIndex(env);
  } catch {
    await reindexSearchIndex(env);
  }
}

async function searchContent(env, rawQuery, sessionId, limit = 50) {
  const cleaned = (rawQuery || "").replace(/[^\w\s\u00C0-\u024F\u0400-\u04FF]/g, " ").trim();
  if (cleaned.length === 0) return { query: rawQuery, matches: [] };
  const terms = cleaned.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { query: rawQuery, matches: [] };
  const ftsQuery = terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
  const rows = await env.OBI_DB.prepare(
    `SELECT i.section_id, s.label, s.title, i.paragraph_index,
       snippet(search_index, 2, '<mark>', '</mark>', '…', 60) AS snippet
     FROM search_index i
     JOIN book_sections s ON s.section_id = i.section_id
     WHERE search_index MATCH ?
     ORDER BY rank
     LIMIT ?`,
  ).bind(ftsQuery, limit).all();
  return {
    query: rawQuery,
    matches: (rows.results || []).map((row) => ({
      section_id: row.section_id,
      section_label: row.label || "",
      section_title: row.title || "",
      paragraph_index: Number(row.paragraph_index || 0),
      snippet: row.snippet || "",
    })),
  };
}

async function ensurePurchaseSchema(env) {
  if (repairedPurchaseSchemas.has(env.OBI_DB)) return;
  const info = await env.OBI_DB.prepare("PRAGMA table_info(purchases)").bind().all();
  const names = new Set((info.results || []).map((item) => item.name));
  if (!names.has("reader_name")) {
    try {
      await env.OBI_DB.prepare("ALTER TABLE purchases ADD COLUMN reader_name TEXT").bind().run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error)))
        throw error;
    }
  }
  if (!names.has("expires_at")) {
    try {
      await env.OBI_DB.prepare("ALTER TABLE purchases ADD COLUMN expires_at TEXT").bind().run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error)))
        throw error;
    }
    const days = await getAccessDays(env).catch(() => 365);
    await env.OBI_DB.prepare(
      "UPDATE purchases SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', granted_at, ?) WHERE expires_at IS NULL AND granted_at IS NOT NULL",
    )
      .bind(`+${days} days`)
      .run()
      .catch(() => null);
  }
  if (!names.has("edition_no")) {
    try {
      await env.OBI_DB.prepare("ALTER TABLE purchases ADD COLUMN edition_no INTEGER NOT NULL DEFAULT 1").bind().run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error && error.message ? error.message : error)))
        throw error;
    }
  }
  repairedPurchaseSchemas.add(env.OBI_DB);
}

function expected(session) {
  const metadataMinor = Number(session?.metadata?.price_minor);
  const quoted = Number.isSafeInteger(metadataMinor) && metadataMinor > 0 ? metadataMinor : PRICE;
  // Stripe's total can include tax. Never accept a discount, shipping charge,
  // different subtotal, or an unexplained increase as the edition payment.
  const details = session?.total_details;
  const tax = details?.amount_tax;
  const taxMatches = session?.amount_subtotal === quoted &&
    Number.isSafeInteger(tax) && tax >= 0 &&
    details?.amount_discount === 0 && details?.amount_shipping === 0 &&
    session?.amount_total === quoted + tax;
  const amountMatches = details && session?.amount_subtotal != null ? taxMatches : session?.amount_total === quoted;
  return (
    session?.id?.startsWith("cs_") &&
    session.payment_status === "paid" &&
    session.currency?.toLowerCase() === "usd" &&
    amountMatches &&
    session.metadata?.product_sku === SKU &&
    /^[a-f0-9]{64}$/.test(session.metadata?.device_hash || "")
  );
}

async function activePurchase(env, sessionId) {
  await ensure(env);
  return env.OBI_DB.prepare(
    "SELECT checkout_session_id,expires_at,edition_no FROM purchases WHERE checkout_session_id=? AND status='active' AND (expires_at IS NULL OR expires_at > ?)",
  )
    .bind(sessionId, new Date().toISOString())
    .first();
}

async function purchaseRecord(env, sessionId) {
  await ensure(env);
  return env.OBI_DB.prepare(
    "SELECT checkout_session_id,status,expires_at,edition_no FROM purchases WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
}

async function accessDenied(env, request, sessionId) {
  const purchase = await purchaseRecord(env, sessionId).catch(() => null);
  if (purchase && purchase.expires_at && purchase.expires_at <= new Date().toISOString()) {
    return reply(
      { error: "Your annual access has expired. Renew to continue reading.", code: "expired", expires_at: purchase.expires_at },
      request,
      { status: 403 },
    );
  }
  return reply({ error: "Reader access is not active" }, request, { status: 403 });
}

async function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(value)
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 48);
}

function cookieValue(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
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
  const row = await env.OBI_DB.prepare(
    "SELECT a.id, a.email FROM obi_accounts a JOIN obi_account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? ",
  )
    .bind(tokenHash, new Date().toISOString())
    .first();
  return row || null;
}

function authCookie(token) {
  return `obiism_session=${encodeURIComponent(token)}; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

// Old manual test rows may contain references the reader cannot accept. Do
// not send users to those rows or let them hide a valid provider reference.
async function accountPurchase(env, email) {
  const row = await env.OBI_DB.prepare(
    `SELECT p.checkout_session_id,p.expires_at FROM purchases p
    LEFT JOIN gift_orders g ON g.checkout_session_id=p.checkout_session_id
    WHERE p.status='active' AND (p.expires_at IS NULL OR p.expires_at > ?)
      AND (p.checkout_session_id GLOB 'obi_*' OR p.checkout_session_id GLOB 'cs_*')
      AND ((g.checkout_session_id IS NULL AND lower(p.purchaser_email)=lower(?))
        OR (g.status='redeemed' AND lower(g.recipient_email)=lower(?)))
    ORDER BY p.granted_at DESC LIMIT 1`,
  )
    .bind(new Date().toISOString(), email, email)
    .first();
  return row && validSessionId(row.checkout_session_id) ? row : null;
}

async function latestAccountPurchase(env, email) {
  const row = await env.OBI_DB.prepare(
    `SELECT p.checkout_session_id,p.expires_at,p.status FROM purchases p
    LEFT JOIN gift_orders g ON g.checkout_session_id=p.checkout_session_id
    WHERE p.status='active'
      AND (p.checkout_session_id GLOB 'obi_*' OR p.checkout_session_id GLOB 'cs_*')
      AND ((g.checkout_session_id IS NULL AND lower(p.purchaser_email)=lower(?))
        OR (g.status='redeemed' AND lower(g.recipient_email)=lower(?)))
    ORDER BY p.granted_at DESC LIMIT 1`,
  )
    .bind(email, email)
    .first();
  return row && validSessionId(row.checkout_session_id) ? row : null;
}

async function sendAccountVerification(env, account, { localTest = false } = {}) {
  const from = env.ACCOUNT_FROM_EMAIL || env.GIFT_FROM_EMAIL;
  const emailConfigured = env.RESEND_API_KEY?.startsWith("re_") && Boolean(from);
  if (!emailConfigured && !localTest)
    return { status: 503, body: { error: "Email verification is not configured." } };
  const recent = await env.OBI_DB.prepare(
    "SELECT count(*) AS count FROM account_verification_challenges WHERE account_id=? AND created_at>?",
  )
    .bind(account.id, new Date(Date.now() - 3600000).toISOString())
    .first();
  if (Number(recent?.count || 0) >= 5)
    return {
      status: 429,
      body: { error: "Too many verification requests. Please try again later." },
    };
  const id = `verify_${await randomToken(24)}`;
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const code = String(bytes[0] % 100000000).padStart(8, "0");
  const now = new Date();
  await env.OBI_DB.prepare(
    "INSERT INTO account_verification_challenges (id,account_id,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)",
  )
    .bind(
      id,
      account.id,
      await hashDeviceToken(`${id}:${code}`),
      now.toISOString(),
      new Date(now.getTime() + 600000).toISOString(),
    )
    .run();
  if (!emailConfigured)
    return { status: 200, body: { message: "Local test code", testCode: code }, localTest: true };
  const message = verificationEmail({
    code,
    link: `${publicOrigin(env)}/verify-email`,
    email: account.email,
  });
  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [account.email],
        reply_to: env.OBI_SUPPORT_EMAIL || "admin@readobiism.com",
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: "type", value: "account-verification" }],
      }),
    });
    if (!sent.ok) throw new Error("Email provider rejected request");
  } catch {
    await env.OBI_DB.prepare("UPDATE account_verification_challenges SET consumed_at=? WHERE id=?")
      .bind(new Date().toISOString(), id)
      .run();
    return {
      status: 503,
      body: { error: "Could not send the verification code. Please try again." },
    };
  }
  return { status: 200, body: { message: "Verification code sent." }, sent: true };
}

async function registerAccount(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128)
    return reply(
      { error: "Enter a valid email and a password of at least 8 characters." },
      request,
      { status: 400 },
    );
  await ensure(env);
  const rateLimited =
    (await enforceLimit(request, env, "register", "register-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "register", "register-email", email));
  if (rateLimited) return rateLimited;
  const existing = await env.OBI_DB.prepare("SELECT id FROM obi_accounts WHERE email=?")
    .bind(email)
    .first();
  if (existing)
    return reply(
      { error: "An account already exists for this email. Sign in instead." },
      request,
      { status: 409 },
    );
  const id = `acct_${await randomToken(18)}`;
  const salt = passwordSalt();
  const digest = await passwordDigest(password, salt);
  const now = new Date();
  const token = await randomToken();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "INSERT INTO obi_accounts (id,email,password_hash,password_salt,created_at,last_signed_in) VALUES (?,?,?,?,?,?)",
    ).bind(id, email, digest, salt, now.toISOString(), now.toISOString()),
    env.OBI_DB.prepare(
      "INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)",
    ).bind(
      await hashDeviceToken(token),
      id,
      now.toISOString(),
      new Date(now.getTime() + 2592000000).toISOString(),
    ),
  ]);
  const purchase = await accountPurchase(env, email);
  let verification = { sent: false };
  try {
    verification = await sendAccountVerification(env, { id, email });
  } catch (error) {
    console.error("Registration verification email failed", error);
  }
  return reply(
    {
      account: { email, email_verified: false },
      access: Boolean(purchase),
      sessionId: purchase?.checkout_session_id ?? null,
      verification_sent: Boolean(verification.sent),
      ...(usesBearerAuth(request) ? { token } : {}),
    },
    request,
    { headers: { "set-cookie": authCookie(token) } },
  );
}

async function loginAccount(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  await ensure(env);
  const rateLimited =
    (await enforceLimit(request, env, "login", "login-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "login", "login-account", email || "anonymous"));
  if (rateLimited) return rateLimited;
  const account = await env.OBI_DB.prepare(
    "SELECT id,email,password_hash,password_salt FROM obi_accounts WHERE email=?",
  )
    .bind(email)
    .first();
  if (
    !account ||
    !(await passwordDigest(password, account.password_salt)).startsWith(account.password_hash)
  )
    return reply({ error: "Email or password is incorrect." }, request, { status: 401 });
  const now = new Date();
  const token = await randomToken();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare("UPDATE obi_accounts SET last_signed_in=? WHERE id=?").bind(
      now.toISOString(),
      account.id,
    ),
    env.OBI_DB.prepare(
      "INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)",
    ).bind(
      await hashDeviceToken(token),
      account.id,
      now.toISOString(),
      new Date(now.getTime() + 2592000000).toISOString(),
    ),
  ]);
  const purchase = await accountPurchase(env, account.email);
  return reply(
    {
      account: { email: account.email },
      access: Boolean(purchase),
      sessionId: purchase?.checkout_session_id ?? null,
      ...(usesBearerAuth(request) ? { token } : {}),
    },
    request,
    { headers: { "set-cookie": authCookie(token) } },
  );
}

function localPasswordResetTest(request, env) {
  const url = new URL(request.url);
  return (
    env.OBI_LOCAL_TRANSFER_TEST === "1" &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname)
  );
}

async function forgotPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email) || email.length > 254)
    return reply({ error: "Enter a valid email address." }, request, { status: 400 });
  await ensure(env);
  const rateLimited =
    (await enforceLimit(request, env, "password-reset", "password-reset-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "password-reset", "password-reset-account", email));
  if (rateLimited) return rateLimited;

  // The response must be identical whether or not the address has an account,
  // so a failure for one reader can never be used to enumerate accounts. Only
  // a service-wide misconfiguration is reported, and it is checked before the
  // account is looked up.
  const generic = {
    message:
      "If an account exists for that email, a reset code has been sent. Check your inbox and spam folder.",
  };
  const localTest = localPasswordResetTest(request, env);
  const from = env.ACCOUNT_FROM_EMAIL || env.GIFT_FROM_EMAIL;
  const emailConfigured = env.RESEND_API_KEY?.startsWith("re_") && Boolean(from);
  if (!emailConfigured && !localTest)
    return reply(
      { error: "Password recovery is not available right now. Please contact support." },
      request,
      { status: 503 },
    );

  const account = await env.OBI_DB.prepare("SELECT id,email FROM obi_accounts WHERE email=?")
    .bind(email)
    .first();
  if (!account) return reply(generic, request);

  let result;
  try {
    result = await sendPasswordReset(env, account, { localTest });
  } catch (error) {
    console.error("Password reset request failed", error);
    return reply(generic, request);
  }
  if (result.status >= 400) {
    console.error("Password reset request rejected", result.status, result.body);
    return reply(generic, request);
  }
  return reply(
    {
      ...generic,
      ...(result.body?.testCode ? { testCode: result.body.testCode } : {}),
    },
    request,
  );
}

async function resetPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = String(body.code || "").replace(/\D/g, "").slice(0, 8);
  const password = typeof body.password === "string" ? body.password : "";
  if (!validEmail(email) || email.length > 254 || code.length !== 8)
    return reply({ error: "Invalid or expired reset code." }, request, { status: 400 });
  if (password.length < 8 || password.length > 128)
    return reply({ error: "Enter a new password of at least 8 characters." }, request, {
      status: 400,
    });
  await ensure(env);
  const rateLimited =
    (await enforceLimit(
      request,
      env,
      "password-reset",
      "password-reset-confirm-ip",
      clientIp(request),
    )) ||
    (await enforceLimit(request, env, "password-reset", "password-reset-account", email));
  if (rateLimited) return rateLimited;

  const account = await env.OBI_DB.prepare("SELECT id,email FROM obi_accounts WHERE email=?")
    .bind(email)
    .first();
  if (!account) return reply({ error: "Invalid or expired reset code." }, request, { status: 400 });
  const challenge = await env.OBI_DB.prepare(
    "SELECT * FROM account_password_resets WHERE account_id=? AND consumed_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(account.id, new Date().toISOString())
    .first();
  if (!challenge)
    return reply({ error: "Invalid or expired reset code." }, request, { status: 400 });
  if (challenge.attempts >= 5)
    return reply({ error: "Too many attempts. Request a new reset code." }, request, {
      status: 429,
    });
  if (!(await same(challenge.code_hash, await hashDeviceToken(`${challenge.id}:${code}`)))) {
    await env.OBI_DB.prepare(
      "UPDATE account_password_resets SET attempts=attempts+1 WHERE id=?",
    )
      .bind(challenge.id)
      .run();
    return reply({ error: "Invalid or expired reset code." }, request, { status: 400 });
  }

  const salt = passwordSalt();
  const digest = await passwordDigest(password, salt);
  const now = new Date();
  const token = await randomToken();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "UPDATE account_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL",
    ).bind(now.toISOString(), account.id),
    env.OBI_DB.prepare(
      "UPDATE obi_accounts SET password_hash=?,password_salt=?,email_verified=1,last_signed_in=? WHERE id=?",
    ).bind(digest, salt, now.toISOString(), account.id),
    env.OBI_DB.prepare("DELETE FROM obi_account_sessions WHERE account_id=?").bind(account.id),
    env.OBI_DB.prepare(
      "INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)",
    ).bind(
      await hashDeviceToken(token),
      account.id,
      now.toISOString(),
      new Date(now.getTime() + 2592000000).toISOString(),
    ),
  ]);
  const purchase = await accountPurchase(env, account.email);
  return reply(
    {
      ok: true,
      account: { email: account.email },
      access: Boolean(purchase),
      sessionId: purchase?.checkout_session_id ?? null,
      ...(usesBearerAuth(request) ? { token } : {}),
    },
    request,
    { headers: { "set-cookie": authCookie(token) } },
  );
}

async function changeAccountPassword(request, env) {
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ error: "Sign in required" }, request, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const current = typeof body.current_password === "string" ? body.current_password : "";
  const next = typeof body.new_password === "string" ? body.new_password : "";
  if (next.length < 8 || next.length > 128)
    return reply({ error: "Enter a new password of at least 8 characters." }, request, {
      status: 400,
    });
  const rateLimited =
    (await enforceLimit(
      request,
      env,
      "password-change",
      "password-change-ip",
      clientIp(request),
    )) ||
    (await enforceLimit(request, env, "password-change", "password-reset-account", account.email));
  if (rateLimited) return rateLimited;
  const row = await env.OBI_DB.prepare(
    "SELECT id,email,password_hash,password_salt FROM obi_accounts WHERE id=?",
  )
    .bind(account.id)
    .first();
  if (!row) return reply({ error: "Account not found" }, request, { status: 404 });
  if (!(await passwordDigest(current, row.password_salt)).startsWith(row.password_hash))
    return reply({ error: "Your current password is incorrect." }, request, { status: 401 });
  if (current === next)
    return reply({ error: "Choose a password that is different from your current one." }, request, {
      status: 400,
    });
  const salt = passwordSalt();
  const digest = await passwordDigest(next, salt);
  const token = bearerToken(request) || cookieValue(request, "obiism_session");
  const currentHash = token ? await hashDeviceToken(token) : "";
  const now = new Date().toISOString();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "UPDATE obi_accounts SET password_hash=?,password_salt=?,last_signed_in=? WHERE id=?",
    ).bind(digest, salt, now, account.id),
    env.OBI_DB.prepare(
      "DELETE FROM obi_account_sessions WHERE account_id=? AND token_hash<>?",
    ).bind(account.id, currentHash),
  ]);
  return reply({ ok: true }, request);
}

async function googleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!(await isFeatureEnabled(env, "google_signin"))) {
    return reply({ error: "Google sign-in is temporarily unavailable." }, request, {
      status: 503,
    });
  }
  const credential = typeof body.credential === "string" ? body.credential : "";
  if (!env.GOOGLE_CLIENT_ID)
    return reply({ error: "Google sign-in is not configured." }, request, { status: 503 });
  if (credential.length < 20 || credential.length > 10000)
    return reply({ error: "Invalid Google credential." }, request, { status: 400 });
  await ensure(env);
  const rateLimited = await enforceLimit(request, env, "google", "google-ip", clientIp(request));
  if (rateLimited) return rateLimited;
  let info;
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    );
    info = await response.json().catch(() => null);
    if (!response.ok || !info)
      return reply({ error: "Google sign-in could not be verified." }, request, { status: 401 });
  } catch {
    return reply({ error: "Google sign-in is temporarily unavailable." }, request, {
      status: 502,
    });
  }
  const email = String(info.email || "")
    .trim()
    .toLowerCase();
  const subject = String(info.sub || "");
  const verified = info.email_verified === true || info.email_verified === "true";
  const issuer = String(info.iss || "");
  const expires = Number(info.exp);
  if (
    String(info.aud || "") !== env.GOOGLE_CLIENT_ID ||
    !["accounts.google.com", "https://accounts.google.com"].includes(issuer) ||
    !verified ||
    !validEmail(email) ||
    !subject ||
    (Number.isFinite(expires) && expires * 1000 < Date.now())
  ) {
    return reply({ error: "Google sign-in could not be verified." }, request, { status: 401 });
  }
  const accountLimited = await enforceLimit(request, env, "google", "google-account", email);
  if (accountLimited) return accountLimited;
  const now = new Date();
  let account = await env.OBI_DB.prepare(
    "SELECT id,email,google_sub FROM obi_accounts WHERE email=?",
  )
    .bind(email)
    .first();
  if (account) {
    if (account.google_sub && account.google_sub !== subject)
      return reply({ error: "This email is linked to a different Google account." }, request, {
        status: 409,
      });
    await env.OBI_DB.prepare(
      "UPDATE obi_accounts SET google_sub=COALESCE(google_sub,?), auth_provider='google', email_verified=1, last_signed_in=? WHERE id=?",
    )
      .bind(subject, now.toISOString(), account.id)
      .run();
  } else {
    const id = `acct_${await randomToken(18)}`;
    const salt = passwordSalt();
    const digest = await passwordDigest(await randomToken(48), salt);
    await env.OBI_DB.prepare(
      "INSERT INTO obi_accounts (id,email,password_hash,password_salt,email_verified,google_sub,auth_provider,created_at,last_signed_in) VALUES (?,?,?,?,1,?, 'google', ?, ?)",
    )
      .bind(id, email, digest, salt, subject, now.toISOString(), now.toISOString())
      .run();
    account = { id, email, google_sub: subject };
  }
  const token = await randomToken();
  await env.OBI_DB.prepare(
    "INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)",
  )
    .bind(
      await hashDeviceToken(token),
      account.id,
      now.toISOString(),
      new Date(now.getTime() + 2592000000).toISOString(),
    )
    .run();
  const purchase = await accountPurchase(env, email);
  return reply(
    {
      account: { email, email_verified: true },
      access: Boolean(purchase),
      sessionId: purchase?.checkout_session_id ?? null,
      provider: "google",
      ...(usesBearerAuth(request) ? { token } : {}),
    },
    request,
    { headers: { "set-cookie": authCookie(token) } },
  );
}

function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  const plus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!plus && digits.length === 11 && digits.startsWith("0")) digits = "234" + digits.slice(1);
  if (digits.length < 7 || digits.length > 15) return "";
  return "+" + digits;
}

async function phoneAccountEmail(phone) {
  return `phone_${(await hashDeviceToken(phone)).slice(0, 24)}@phone.obiism.local`;
}

async function registerPhoneAccount(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!(await isFeatureEnabled(env, "phone_signin"))) {
    return reply({ error: "Phone account creation is temporarily unavailable." }, request, {
      status: 503,
    });
  }
  const phone = normalizePhone(body.phone);
  const password = typeof body.password === "string" ? body.password : "";
  if (!phone)
    return reply(
      { error: "Enter a valid phone number with country code, for example +234 801 234 5678." },
      request,
      { status: 400 },
    );
  if (password.length < 8 || password.length > 128)
    return reply({ error: "Enter a password of at least 8 characters." }, request, {
      status: 400,
    });
  await ensure(env);
  const rateLimited =
    (await enforceLimit(request, env, "register", "register-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "register", "register-phone", phone));
  if (rateLimited) return rateLimited;
  const existing = await env.OBI_DB.prepare("SELECT id FROM obi_accounts WHERE phone=?")
    .bind(phone)
    .first();
  if (existing)
    return reply({ error: "A phone account already exists. Sign in instead." }, request, {
      status: 409,
    });
  const email = await phoneAccountEmail(phone);
  const id = `acct_${await randomToken(18)}`;
  const salt = passwordSalt();
  const digest = await passwordDigest(password, salt);
  const now = new Date();
  const token = await randomToken();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "INSERT INTO obi_accounts (id,email,password_hash,password_salt,email_verified,phone,phone_verified,google_sub,auth_provider,created_at,last_signed_in) VALUES (?,?,?,?,0,?,0,NULL,'phone',?,?)",
    ).bind(id, email, digest, salt, phone, now.toISOString(), now.toISOString()),
    env.OBI_DB.prepare(
      "INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)",
    ).bind(
      await hashDeviceToken(token),
      id,
      now.toISOString(),
      new Date(now.getTime() + 2592000000).toISOString(),
    ),
  ]);
  const purchase = await accountPurchase(env, email);
  return reply(
    {
      account: { email, phone, email_verified: false, phone_verified: false },
      access: Boolean(purchase),
      sessionId: purchase?.checkout_session_id ?? null,
      ...(usesBearerAuth(request) ? { token } : {}),
    },
    request,
    { headers: { "set-cookie": authCookie(token) } },
  );
}

async function loginPhoneAccount(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!(await isFeatureEnabled(env, "phone_signin"))) {
    return reply({ error: "Phone sign-in is temporarily unavailable." }, request, {
      status: 503,
    });
  }
  const phone = normalizePhone(body.phone);
  const password = typeof body.password === "string" ? body.password : "";
  if (!phone) return reply({ error: "Enter a valid phone number." }, request, { status: 400 });
  await ensure(env);
  const rateLimited =
    (await enforceLimit(request, env, "login", "login-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "login", "login-account", phone));
  if (rateLimited) return rateLimited;
  const account = await env.OBI_DB.prepare(
    "SELECT id,email,phone,password_hash,password_salt,email_verified,phone_verified FROM obi_accounts WHERE phone=?",
  )
    .bind(phone)
    .first();
  if (
    !account ||
    !(await passwordDigest(password, account.password_salt)).startsWith(account.password_hash)
  ) {
    return reply({ error: "Phone number or password is incorrect." }, request, { status: 401 });
  }
  const now = new Date();
  const token = await randomToken();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare("UPDATE obi_accounts SET last_signed_in=? WHERE id=?").bind(
      now.toISOString(),
      account.id,
    ),
    env.OBI_DB.prepare(
      "INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)",
    ).bind(
      await hashDeviceToken(token),
      account.id,
      now.toISOString(),
      new Date(now.getTime() + 2592000000).toISOString(),
    ),
  ]);
  const purchase = await accountPurchase(env, account.email);
  return reply(
    {
      account: {
        email: account.email,
        phone: account.phone,
        email_verified: account.email_verified === 1,
        phone_verified: account.phone_verified === 1,
      },
      access: Boolean(purchase),
      sessionId: purchase?.checkout_session_id ?? null,
      ...(usesBearerAuth(request) ? { token } : {}),
    },
    request,
    { headers: { "set-cookie": authCookie(token) } },
  );
}

async function accountAccess(request, env) {
  const account = await accountFromRequest(request, env);
  if (!account) return reply({ authenticated: false, access: false }, request, { status: 401 });
  const purchase = await accountPurchase(env, account.email);
  const latest = purchase || (await latestAccountPurchase(env, account.email));
  const acc = await env.OBI_DB.prepare(
    "SELECT email_verified,phone,phone_verified FROM obi_accounts WHERE id=?",
  )
    .bind(account.id)
    .first()
    .catch(() => null);
  const now = new Date().toISOString();
  const expired = Boolean(latest?.expires_at && latest.expires_at <= now);
  return reply(
    {
      authenticated: true,
      email: account.email,
      phone: acc?.phone || "",
      email_verified: acc?.email_verified === 1,
      phone_verified: acc?.phone_verified === 1,
      access: Boolean(purchase),
      sessionId: latest?.checkout_session_id || null,
      expiresAt: latest?.expires_at || null,
      expired,
    },
    request,
  );
}

async function checkout(request, env) {
  const body = await request.json().catch(() => ({}));
  const {
    email = "",
    device_token: deviceToken = "",
    currency = "USD",
    reader_name: readerName = "",
  } = body;
  const cleanReaderName =
    typeof readerName === "string"
      ? readerName
          .replace(/[\u0000-\u001F\u007F]/g, "")
          .trim()
          .slice(0, 80)
      : "";
  const signedIn = await accountFromRequest(request, env);
  if (!signedIn) return reply({ error: "Sign in or create an account before checkout.", code: "account_required" }, request, { status: 401 });
  const suppliedReceiptEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const receiptEmail = suppliedReceiptEmail || signedIn?.email || "";
  if (!validReceiptEmail(receiptEmail)) {
    return reply({ error: "Enter a real email address for your payment receipt." }, request, {
      status: 400,
    });
  }
  // The receipt address is deliberately separate from the login identity.
  // A phone account keeps its internal address for ownership; the buyer's
  // real email is used only by the payment provider and for contact.
  const purchaserEmail = signedIn?.email || receiptEmail;
  if (!validDeviceToken(deviceToken))
    return reply({ error: "A secure reader device is required" }, request, { status: 400 });
  const gift =
    body.gift === true
      ? {
          code: normalizeGiftCode(body.gift_code),
          recipientName:
            typeof body.recipient_name === "string" ? body.recipient_name.trim().slice(0, 80) : "",
          recipientEmail:
            typeof body.recipient_email === "string"
              ? body.recipient_email.trim().toLowerCase()
              : "",
          message:
            typeof body.gift_message === "string" ? body.gift_message.trim().slice(0, 240) : "",
        }
      : null;
  const features = await getFeatureFlags(env);
  if (!features.single_purchase) {
    return reply({ error: "Single-edition purchases are temporarily unavailable." }, request, {
      status: 503,
    });
  }
  if (gift && !features.gift_purchase) {
    return reply({ error: "Gift purchases are temporarily unavailable." }, request, {
      status: 503,
    });
  }
  await ensure(env);
  const rateLimited = await enforceLimit(
    request,
    env,
    "checkout",
    "checkout-ip",
    clientIp(request),
  );
  if (rateLimited) return rateLimited;
  const pricing = await getPricing(env);
  const usdMinor = pricing.USD.minor;

  if (gift) {
    if (!validGiftCode(gift.code))
      return reply({ error: "A valid gift code is required." }, request, { status: 400 });
    if (gift.recipientName.length < 2)
      return reply({ error: "Enter your friend's name." }, request, { status: 400 });
    if (!validEmail(gift.recipientEmail))
      return reply({ error: "Enter a valid email address for your friend." }, request, {
        status: 400,
      });
    if (gift.recipientEmail === receiptEmail)
      return reply({ error: "Use a different email address for your friend." }, request, {
        status: 400,
      });
    const used = await env.OBI_DB.prepare("SELECT status FROM gift_orders WHERE code=?")
      .bind(gift.code)
      .first();
    if (used)
      return reply({ error: "That gift code is already in use. Please try again." }, request, {
        status: 409,
      });
  }

  const activeEdition = await accountPurchase(env, gift ? gift.recipientEmail : purchaserEmail);
  if (activeEdition && body.confirm_duplicate !== true) {
    const accessDays = await getAccessDays(env).catch(() => 365);
    const warning = gift
      ? `This person already has an active edition. Continuing will charge you again for a separate new edition for them with a fresh ${accessDays}-day term. Their current edition will not be extended or replaced.`
      : `You already have an active edition. Continuing will charge you again for another edition with a fresh ${accessDays}-day term. Your current edition will not be extended or replaced.`;
    return reply(
      {
        error: warning,
        warning,
        code: "existing_edition",
        requires_confirmation: true,
      },
      request,
      { status: 409 },
    );
  }

  if (String(currency).toUpperCase() === "NGN") {
    return paystackCheckout(
      request,
      env,
      receiptEmail,
      deviceToken,
      gift,
      pricing,
      cleanReaderName,
      purchaserEmail,
    );
  }

  if (!env.OBI_STRIPE_SECRET_KEY?.startsWith("sk_"))
    return reply({ error: "Checkout is not configured" }, request, { status: 503 });

  const origin = publicOrigin(env);
  const deviceHash = await hashDeviceToken(deviceToken);
  const form = new URLSearchParams({
    mode: "payment",
    customer_email: receiptEmail,
    success_url: `${origin}/reader?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?purchase=cancelled`,
    "metadata[product_sku]": SKU,
    "metadata[purchaser_email]": purchaserEmail,
    "metadata[receipt_email]": receiptEmail,
    "metadata[device_hash]": deviceHash,
    "metadata[price_minor]": String(usdMinor),
    "payment_intent_data[metadata][product_sku]": SKU,
    "payment_intent_data[metadata][price_minor]": String(usdMinor),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(usdMinor),
    "line_items[0][price_data][product_data][name]":
      "OBI-ISM: Building a Just Society Through Character",
    "line_items[0][price_data][product_data][tax_code]": "txcd_10302000",
  });
  if (cleanReaderName) {
    form.set("metadata[reader_name]", cleanReaderName);
    form.set("payment_intent_data[metadata][reader_name]", cleanReaderName);
  }
  if (gift) {
    form.set("success_url", `${origin}/gift-confirmation?session_id={CHECKOUT_SESSION_ID}`);
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
    ? reply(
        {
          url: result.url,
          sessionId: result.id,
          provider: "stripe",
          currency: "USD",
          amount: usdMinor / 100,
        },
        request,
      )
    : reply({ error: "Unable to start secure checkout" }, request, { status: 502 });
}

/**
 * Naira checkout via Paystack. We mint our own reader reference (`obi_…`) and
 * use it as the reader session key, so the reader/claim flow is provider-neutral.
 */
async function paystackCheckout(
  request,
  env,
  email,
  deviceToken,
  gift = null,
  pricing = null,
  readerName = "",
  purchaserEmail = email,
) {
  if (!env.PAYSTACK_SECRET_KEY?.startsWith("sk_"))
    return reply({ error: "Naira checkout is not configured" }, request, { status: 503 });
  const ngnMinor = pricing?.NGN?.minor || NAIRA_PRICE * 100;

  const reference = paystackReference();
  const deviceHash = await hashDeviceToken(deviceToken);
  const origin = localPaystackTest(request, env) ? "http://127.0.0.1:5514" : publicOrigin(env);
  const callback = gift
    ? `${origin}/gift-confirmation?session_id=${reference}`
    : `${origin}/reader?session_id=${reference}`;

  const response = await fetch(`${paystackApi(env)}/transaction/initialize`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: ngnMinor,
      currency: "NGN",
      reference,
      callback_url: callback,
      metadata: {
        product_sku: SKU,
        purchaser_email: purchaserEmail,
        receipt_email: email,
        device_hash: deviceHash,
        provider: "paystack",
        price_minor: String(ngnMinor),
        ...(readerName ? { reader_name: readerName } : {}),
        ...(gift
          ? {
              gift: "1",
              gift_code: gift.code,
              recipient_name: gift.recipientName,
              recipient_email: gift.recipientEmail,
              gift_message: gift.message,
            }
          : {}),
      },
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.status || !result.data?.authorization_url) {
    return reply({ error: result.message || "Unable to start Naira checkout" }, request, {
      status: 502,
    });
  }

  return reply(
    {
      url: result.data.authorization_url,
      sessionId: reference,
      provider: "paystack",
      currency: "NGN",
      amount: ngnMinor / 100,
    },
    request,
  );
}

/** Extracts a gift payload from provider metadata, or null for ordinary purchases. */
function giftDetails(metadata) {
  if (!metadata || String(metadata.gift) !== "1") return null;
  const code = normalizeGiftCode(metadata.gift_code);
  const recipientName = String(metadata.recipient_name || "")
    .trim()
    .slice(0, 80);
  const recipientEmail = String(metadata.recipient_email || "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const message = String(metadata.gift_message || "")
    .trim()
    .slice(0, 240);
  if (!validGiftCode(code) || !validEmail(recipientEmail) || recipientName.length < 2) return null;
  return { code, recipientName, recipientEmail, message };
}

async function saveGiftOrder(env, gift, sessionId, buyerEmail) {
  const result = await env.OBI_DB.prepare(
    "INSERT OR IGNORE INTO gift_orders (code,checkout_session_id,buyer_email,recipient_name,recipient_email,message,status,created_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(
      gift.code,
      sessionId,
      buyerEmail || "",
      gift.recipientName,
      gift.recipientEmail,
      gift.message,
      "active",
      new Date().toISOString(),
    )
    .run();
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
  const link = `${publicOrigin(env)}/redeem?code=${encodeURIComponent(gift.code)}`;
  const message = giftCodeEmail({
    code: gift.code,
    link,
    recipientName: gift.recipientName,
    recipientEmail: gift.recipientEmail,
    message: gift.message,
  });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.GIFT_FROM_EMAIL,
        to: [gift.recipientEmail],
        reply_to: "admin@readobiism.com",
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: "type", value: "gift-code" }],
      }),
    });
    if (!response.ok)
      console.error(
        "Gift email delivery failed",
        response.status,
        await response.text().catch(() => ""),
      );
    return response.ok;
  } catch (error) {
    console.error("Gift email delivery failed", error);
    return false;
  }
}
/** paystack webhook: HMAC-SHA512 of the raw body with the secret key. */
async function paystackWebhook(request, env) {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret?.startsWith("sk_"))
    return reply({ error: "Naira checkout is not configured" }, request, { status: 503 });

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
    if (!env.OBI_DB)
      return reply({ error: "Bulk order storage is not configured." }, request, { status: 503 });
    await ensureBulkOrders(env);
    const order = await env.OBI_DB.prepare("SELECT id FROM bulk_orders WHERE provider_reference=?")
      .bind(reference)
      .first();
    if (!order) return reply({ received: true, ignored: true }, request);
    const result = await verifyBulkOrderPayment(env, order.id);
    if (result.status >= 400)
      return reply(
        { error: result.body.error || "Bulk payment could not be verified." },
        request,
        { status: result.status },
      );
    return reply({ received: true, status: result.body.status }, request);
  }
  if (!validSessionId(reference))
    return reply({ error: "Invalid reference" }, request, { status: 400 });

  return verifyAndRecordPaystack(request, env, reference, event.data?.customer?.email);
}

// Shared by the signed webhook and the explicitly local test recovery path.
// Always verify with Paystack before creating or binding an entitlement.
async function verifyAndRecordPaystack(request, env, reference, fallbackEmail = "") {
  const secret = env.PAYSTACK_SECRET_KEY;
  await ensure(env);
  const existing = await env.OBI_DB.prepare(
    "SELECT checkout_session_id FROM purchases WHERE checkout_session_id=?",
  )
    .bind(reference)
    .first();
  // Re-verify existing purchases: an interruption may have prevented saving the gift.

  // Never grant on the webhook payload alone — verify with Paystack.
  const verifyResponse = await fetch(
    `${paystackApi(env)}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { authorization: `Bearer ${secret}` },
    },
  );
  const verified = await verifyResponse.json().catch(() => ({}));
  const tx = verified?.data;
  if (
    !verifyResponse.ok ||
    !verified.status ||
    tx?.status !== "success" ||
    tx?.reference !== reference
  ) {
    return reply({ error: "Payment could not be verified" }, request, { status: 400 });
  }

  let metadata = tx.metadata ?? null;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }
  const metadataMinor = Number(metadata?.price_minor);
  const amountMatches =
    Number.isSafeInteger(metadataMinor) && metadataMinor > 0
      ? Number(tx.amount) === metadataMinor
      : Number(tx.amount) === NAIRA_PRICE * 100;
  if (String(tx.currency || "").toUpperCase() !== "NGN" || !amountMatches) {
    return reply({ error: "Payment amount does not match the edition price" }, request, {
      status: 400,
    });
  }
  const readerName =
    typeof metadata?.reader_name === "string"
      ? metadata.reader_name
          .replace(/[\u0000-\u001F\u007F]/g, "")
          .trim()
          .slice(0, 80)
      : "";

  const email = String(metadata?.purchaser_email || tx.customer?.email || fallbackEmail || "")
    .trim()
    .toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email))
    return reply({ error: "Missing purchaser email" }, request, { status: 400 });

  const gift = giftDetails(metadata);
  if (String(metadata?.gift) === "1" && !gift) {
    return reply({ error: "Gift payment metadata is incomplete. Contact support." }, request, { status: 400 });
  }
  if (metadata?.product_sku !== SKU || !/^[a-f0-9]{64}$/.test(metadata?.device_hash || "")) {
    return reply({ error: "Payment metadata does not match the edition." }, request, {
      status: 400,
    });
  }
  const now = new Date().toISOString();
  const expiresAt = accessExpiry(await getAccessDays(env), new Date(now));
  const editionNo = (await liveEdition(env))?.edition_no || 1;
  await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "INSERT OR IGNORE INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,reader_name,amount_cents,currency,product_sku,status,granted_at,expires_at,edition_no) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      reference,
      String(tx.id ?? ""),
      email,
      readerName,
      Number(tx.amount),
      "NGN",
      SKU,
      "active",
      now,
      expiresAt,
      editionNo,
    ),
    env.OBI_DB.prepare(
      "INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)",
    ).bind(reference, gift ? "UNBOUND" : metadata.device_hash, now),
  ]);
  if (gift) {
    if (existing) {
      const currentGift = await env.OBI_DB.prepare("SELECT code FROM gift_orders WHERE checkout_session_id=?").bind(reference).first();
      const device = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(reference).first();
      if (!currentGift && device?.device_hash !== "UNBOUND") {
        return reply({ error: "Gift payment needs support review." }, request, { status: 409 });
      }
    }
    const saved = await saveGiftOrder(env, gift, reference, email);
    if (saved.stored) await sendGiftCodeEmail(env, gift);
  }

  return reply({ received: true, ...(existing ? { duplicate: true } : {}), ...(gift ? { gift: gift.code } : {}) }, request);
}

async function recordCheckoutCompletion(event, env) {
  const session = event.data?.object;
  if (event?.type === EVENT && session?.metadata?.bulk_order === "1") {
    const orderId = session.metadata.bulk_order_id;
    if (!/^bprod_[a-f0-9]{32}$/.test(orderId || "")) return { received: true, ignored: true };
    const result = await verifyBulkOrderPayment(env, orderId);
    return { received: true, bulk: true, status: result.body.status };
  }
  if (event?.type !== EVENT || !event.id?.startsWith("evt_") || !expected(session))
    return { received: true, ignored: true };
  await ensure(env);
  const now = new Date().toISOString();
  const email =
    String(
      session.metadata?.purchaser_email ||
        session.customer_details?.email ||
        session.customer_email ||
        "",
    ).toLowerCase() || null;
  const deviceHash = session.metadata.device_hash;
  const gift = giftDetails(session.metadata);
  const readerName =
    typeof session.metadata?.reader_name === "string"
      ? session.metadata.reader_name
          .replace(/[\u0000-\u001F\u007F]/g, "")
          .trim()
          .slice(0, 80)
      : "";
  const amountCents = session.amount_total;
  // A gift belongs to the recipient, not the buyer's browser. Leave the
  // device slot unbound until the recipient redeems the code.
  const deviceValue = gift ? "UNBOUND" : deviceHash;
  const expiresAt = accessExpiry(await getAccessDays(env), new Date(now));
  const editionNo = (await liveEdition(env))?.edition_no || 1;
  const result = await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "INSERT OR IGNORE INTO webhook_events (event_id,event_type,status,received_at) VALUES (?,?,?,?)",
    ).bind(event.id, EVENT, "processed", now),
    env.OBI_DB.prepare(
      "INSERT OR IGNORE INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,reader_name,amount_cents,currency,product_sku,status,granted_at,expires_at,edition_no) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      session.id,
      typeof session.payment_intent === "string" ? session.payment_intent : null,
      email,
      readerName,
      amountCents,
      "usd",
      SKU,
      "active",
      now,
      expiresAt,
      editionNo,
    ),
    env.OBI_DB.prepare(
      "INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)",
    ).bind(session.id, deviceValue, now),
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

// If the browser returns before a Stripe webhook arrives, query Stripe directly.
// The Checkout Session and browser token must match the original purchase.
async function recoverStripeCheckout(env, sessionId, deviceToken) {
  if (!env.OBI_STRIPE_SECRET_KEY?.startsWith("sk_")) return false;
  let response;
  try {
    response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { authorization: `Bearer ${env.OBI_STRIPE_SECRET_KEY}` },
    });
  } catch { return false; }
  const session = await response.json().catch(() => null);
  if (!response.ok || session?.id !== sessionId || session?.status !== "complete" || !expected(session)) return false;
  if (!same(session.metadata.device_hash, await hashDeviceToken(deviceToken))) return false;
  const event = { type: EVENT, id: `evt_recovery_${await hashDeviceToken(sessionId)}`, data: { object: session } };
  const result = await recordCheckoutCompletion(event, env);
  return !result.ignored;
}

async function webhook(request, env) {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  if (!env.OBI_STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"))
    return json({ error: "Stripe webhook is not configured" }, { status: 503 });
  const raw = await request.text();
  if (
    !(await validSignature(
      raw,
      request.headers.get("stripe-signature"),
      env.OBI_STRIPE_WEBHOOK_SECRET,
    ))
  )
    return json({ error: "Webhook signature verification failed" }, { status: 400 });
  const event = await Promise.resolve()
    .then(() => JSON.parse(raw))
    .catch(() => null);
  try {
    return json(await recordCheckoutCompletion(event, env));
  } catch (error) {
    console.error("Webhook fulfillment failed", error);
    return json({ error: "Webhook fulfillment failed" }, { status: 500 });
  }
}

async function claimReader(request, env) {
  const { session_id: sessionId, device_token: deviceToken } = await request
    .json()
    .catch(() => ({}));
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken))
    return reply({ error: "Invalid reader access request" }, request, { status: 400 });
  await ensure(env);
  const localTest = localPaystackTest(request, env) && new URL(request.url).protocol === "http:";
  const rateLimited =
    (await enforceLimit(
      request,
      env,
      "claim",
      localTest ? "claim-ip-local-test" : "claim-ip",
      clientIp(request),
    )) ||
    (await enforceLimit(
      request,
      env,
      "claim",
      localTest ? "claim-device-local-test" : "claim-device",
      deviceToken,
    ));
  if (rateLimited) return rateLimited;
  let purchased = await activePurchase(env, sessionId);
  if (!purchased && sessionId.startsWith("obi_")) {
    // The webhook can lag behind the browser return. Verify the reference
    // directly with Paystack and grant only after the server-side check.
    const verified = await verifyAndRecordPaystack(request, env, sessionId);
    if (verified.ok) purchased = await activePurchase(env, sessionId);
  } else if (!purchased && sessionId.startsWith("cs_")) {
    if (await recoverStripeCheckout(env, sessionId, deviceToken)) purchased = await activePurchase(env, sessionId);
  }
  const pendingGift = await env.OBI_DB.prepare(
    "SELECT status FROM gift_orders WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
  if (pendingGift?.status === "active") {
    return reply(
      {
        error:
          "This edition is a gift. Ask the sender for the gift code, then redeem it at /redeem.",
      },
      request,
      { status: 409 },
    );
  }
  if (!purchased) {
    const expired = await purchaseRecord(env, sessionId).catch(() => null);
    if (expired && expired.expires_at && expired.expires_at <= new Date().toISOString()) {
      return reply(
        { error: "Your annual access has expired. Renew to continue reading.", code: "expired", expires_at: expired.expires_at },
        request,
        { status: 403 },
      );
    }
    return reply({ error: "Purchase is not ready yet. Please retry shortly." }, request, {
      status: 404,
    });
  }
  const deviceHash = await hashDeviceToken(deviceToken);
  const metadataJson = JSON.stringify(await requestDeviceMetadata(request));
  const existing = await env.OBI_DB.prepare(
    "SELECT device_hash FROM reader_devices WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
  if (existing && existing.device_hash !== "UNBOUND" && !same(existing.device_hash, deviceHash))
    return reply({ error: "This edition is already active on another device." }, request, {
      status: 409,
    });
  if (!existing) {
    await env.OBI_DB.prepare(
      "INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at,metadata_json) VALUES (?,?,?,?)",
    )
      .bind(sessionId, deviceHash, new Date().toISOString(), metadataJson)
      .run();
  } else if (existing.device_hash === "UNBOUND") {
    await env.OBI_DB.prepare(
      "UPDATE reader_devices SET device_hash=?, claimed_at=?, metadata_json=? WHERE checkout_session_id=? AND device_hash='UNBOUND'",
    )
      .bind(deviceHash, new Date().toISOString(), metadataJson, sessionId)
      .run();
  } else {
    await env.OBI_DB.prepare(
      "UPDATE reader_devices SET metadata_json=? WHERE checkout_session_id=? AND device_hash=?",
    )
      .bind(metadataJson, sessionId, deviceHash)
      .run();
  }
  const actual = await env.OBI_DB.prepare(
    "SELECT device_hash FROM reader_devices WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
  if (!actual || !same(actual.device_hash, deviceHash))
    return reply({ error: "This edition is already active on another device." }, request, {
      status: 409,
    });
  return reply({ access: true, deviceBound: true }, request);
}

async function redeemLocalBulk(request, env) {
  if (!bulkLocalEnabled(request, env)) return json({ error: "Not found" }, { status: 404 });
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    !(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")
  )
    return reply({ error: "Request not allowed." }, request, { status: 403 });
  const account = await accountFromRequest(request, env);
  if (!account)
    return reply({ error: "Sign in to your reader account first." }, request, { status: 401 });
  const rateLimited =
    (await enforceLimit(request, env, "bulk-local", "bulk-local-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "bulk-local", "bulk-local-account", account.id));
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({}));
  if (!validDeviceToken(body.device_token))
    return reply({ error: "A secure reader device is required." }, request, { status: 400 });
  const result = await redeemBulkLocal(
    env,
    account,
    body.code,
    await hashDeviceToken(body.device_token),
  );
  return reply(result.body, request, { status: result.status });
}

async function bulkSeats(request, env) {
  const path = new URL(request.url).pathname;
  const origin = request.headers.get("origin");
  const allowed = origin && (allowedOrigins.has(origin) || devOrigins.has(origin));
  if (request.method === "POST" && !allowed)
    return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  if (
    request.method === "POST" &&
    !(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")
  )
    return reply({ error: "Request not allowed." }, request, { status: 415 });
  const account = await accountFromRequest(request, env);
  if (!account)
    return reply({ error: "Sign in to your account first." }, request, { status: 401 });
  const rateLimited =
    (await enforceLimit(request, env, "bulk-order", "bulk-order-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "bulk-order", "bulk-order-account", account.id));
  if (rateLimited) return rateLimited;
  const url = new URL(request.url);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const orderId = url.searchParams.get("order_id") || body.order_id;
  if (!/^bprod_[a-f0-9]{32}$/.test(orderId || ""))
    return reply({ error: "Invalid order." }, request, { status: 400 });
  const order = await env.OBI_DB.prepare(
    "SELECT id,buyer_email,buyer_account_id,status FROM bulk_orders WHERE id=?",
  )
    .bind(orderId)
    .first();
  const ownsOrder =
    order &&
    (order.buyer_account_id
      ? order.buyer_account_id === account.id
      : order.buyer_email === account.email);
  if (!ownsOrder) return reply({ error: "Order not found." }, request, { status: 404 });
  if (order.status !== "paid")
    return reply({ error: "Individual seat links are available after payment." }, request, {
      status: 409,
    });
  if (request.method === "GET" && path === "/api/bulk/seats") {
    const data = await seatsForOrder(env, orderId);
    return reply(data || { seats: [] }, request);
  }
  if (request.method === "POST" && path === "/api/bulk/seats/assign") {
    const result = await assignBulkSeat(
      env,
      orderId,
      body.seat_no,
      { label: body.label, email: body.email, phone: body.phone },
      account.email,
    );
    return reply(result.body, request, { status: result.status });
  }
  if (request.method === "POST" && path === "/api/bulk/seats/revoke") {
    const result = await revokeBulkSeat(env, orderId, body.seat_no, account.email);
    return reply(result.body, request, { status: result.status });
  }
  return reply({ error: "Method not allowed." }, request, { status: 405 });
}

async function claimBulkSeatEndpoint(request, env) {
  if (!transferOriginAllowed(request))
    return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  const account = await accountFromRequest(request, env);
  if (!account)
    return reply({ error: "Sign in to your reader account first." }, request, { status: 401 });
  const rateLimited =
    (await enforceLimit(request, env, "bulk-order", "bulk-order-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "bulk-order", "bulk-order-account", account.id));
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({}));
  if (!validDeviceToken(body.device_token))
    return reply({ error: "A secure reader device is required." }, request, { status: 400 });
  const result = await claimBulkSeat(
    env,
    account,
    body.seat_token,
    await hashDeviceToken(body.device_token),
  );
  if (result.status === 200 && result.body.session_id) {
    try {
      const metadataJson = JSON.stringify(await requestDeviceMetadata(request));
      await env.OBI_DB.prepare(
        "UPDATE reader_devices SET metadata_json=? WHERE checkout_session_id=?",
      )
        .bind(metadataJson, result.body.session_id)
        .run();
    } catch {
      /* metadata is optional */
    }
  }
  return reply(result.body, request, { status: result.status });
}

async function createBulkOrder(request, env) {
  const origin = request.headers.get("origin");
  const allowed = origin && (allowedOrigins.has(origin) || devOrigins.has(origin));
  if (!allowed)
    return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json"))
    return reply({ error: "Request not allowed." }, request, { status: 415 });
  const body = await request.json().catch(() => ({}));
  const rateLimited = await enforceLimit(
    request,
    env,
    "bulk-order",
    "bulk-order-ip",
    clientIp(request),
  );
  if (rateLimited) return rateLimited;
  const account = await accountFromRequest(request, env);
  if (!account)
    return reply({ error: "Sign in to your account first." }, request, { status: 401 });
  if (!(await isFeatureEnabled(env, "bulk_purchase"))) {
    return reply({ error: "Bulk purchases are temporarily unavailable." }, request, {
      status: 503,
    });
  }
  const suppliedReceiptEmail =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  // Keep an already-cached bulk page working while the new receipt-email form
  // rolls out. Phone accounts have no real mailbox, so they still must supply
  // one explicitly.
  const receiptEmail =
    suppliedReceiptEmail || (validReceiptEmail(account.email) ? account.email : "");
  if (!validReceiptEmail(receiptEmail)) {
    return reply({ error: "Enter a real email address for your payment receipt." }, request, {
      status: 400,
    });
  }
  const quantity = Number(body.quantity);
  const provider = String(body.provider || "").toLowerCase();
  if (!["paystack", "stripe"].includes(provider))
    return reply({ error: "Choose a supported payment gateway." }, request, { status: 400 });
  // Buyer-controlled discounts are never approvals. An authenticated admin
  // approval workflow must be implemented before discounts are accepted.
  if (body.discount != null)
    return reply({ error: "Bulk discounts require administrator approval." }, request, {
      status: 403,
    });
  const result = await createBulkOrderCheckout(
    env,
    account.email,
    quantity,
    provider,
    null,
    account.email,
    {
      receiptEmail,
      buyerAccountId: account.id,
    },
  );
  return reply(result.body, request, { status: result.status });
}

async function verifyBulkOrder(request, env) {
  const account = await accountFromRequest(request, env);
  if (!account)
    return reply({ error: "Sign in to your account first." }, request, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = body.order_id || body.id;
  if (!/^bprod_[a-f0-9]{32}$/.test(id || ""))
    return reply({ error: "Invalid order." }, request, { status: 400 });
  const order = await env.OBI_DB.prepare(
    "SELECT buyer_email,buyer_account_id FROM bulk_orders WHERE id=?",
  )
    .bind(id)
    .first();
  const ownsOrder =
    order &&
    (order.buyer_account_id
      ? order.buyer_account_id === account.id
      : order.buyer_email === account.email);
  if (!ownsOrder) return reply({ error: "Order not found." }, request, { status: 404 });
  const result = await verifyBulkOrderPayment(env, id);
  return reply(result.body, request, { status: result.status });
}

async function claimBulkOrderEndpoint(request, env) {
  const origin = request.headers.get("origin");
  const allowed = origin && (allowedOrigins.has(origin) || devOrigins.has(origin));
  if (!allowed)
    return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  const account = await accountFromRequest(request, env);
  if (!account)
    return reply({ error: "Sign in to your reader account first." }, request, { status: 401 });
  const rateLimited =
    (await enforceLimit(request, env, "bulk-order", "bulk-order-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "bulk-order", "bulk-order-account", account.id));
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({}));
  if (!validDeviceToken(body.device_token))
    return reply({ error: "A secure reader device is required." }, request, { status: 400 });
  const result = await claimBulkOrder(
    env,
    account,
    body.code,
    await hashDeviceToken(body.device_token),
  );
  if (result.status === 200 && result.body.session_id) {
    try {
      const metadataJson = JSON.stringify(await requestDeviceMetadata(request));
      await env.OBI_DB.prepare(
        "UPDATE reader_devices SET metadata_json=? WHERE checkout_session_id=?",
      )
        .bind(metadataJson, result.body.session_id)
        .run();
    } catch {
      /* metadata is optional */
    }
  }
  return reply(result.body, request, { status: result.status });
}

// A transfer requires both an authenticated account and a fresh code sent to
// the purchaser (or redeemed gift recipient). No device token leaves the server.
async function transferOwner(env, sessionId, email) {
  return env.OBI_DB.prepare(
    "SELECT p.checkout_session_id FROM purchases p LEFT JOIN gift_orders g ON g.checkout_session_id=p.checkout_session_id WHERE p.checkout_session_id=? AND p.status='active' AND ((g.checkout_session_id IS NULL AND p.purchaser_email=?) OR (g.status='redeemed' AND g.recipient_email=?))",
  )
    .bind(sessionId, email, email)
    .first();
}

function transferOriginAllowed(request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const sameLocalOrigin =
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    origin === url.origin;
  return (
    !origin ||
    allowedOrigins.has(origin) ||
    devOrigins.has(origin) ||
    sameLocalOrigin ||
    (origin === "http://127.0.0.1:8787" && url.hostname === "127.0.0.1")
  );
}

async function startDeviceTransfer(request, env) {
  if (!transferOriginAllowed(request))
    return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  if (!(await isFeatureEnabled(env, "device_transfer"))) {
    return reply({ error: "Device transfers are temporarily unavailable." }, request, {
      status: 503,
    });
  }
  const account = await accountFromRequest(request, env);
  if (!account)
    return reply({ error: "Please sign in before moving your edition." }, request, {
      status: 401,
    });
  const authLimited = await enforceLimit(request, env, "transfer", "transfer-auth", account.id);
  if (authLimited) return authLimited;
  const body = await request.json().catch(() => ({}));
  if (!validSessionId(body.session_id) || !validDeviceToken(body.device_token))
    return reply({ error: "Invalid transfer request." }, request, { status: 400 });
  const password = typeof body.password === "string" ? body.password : "";
  const accountRow = await env.OBI_DB.prepare(
    "SELECT password_hash,password_salt FROM obi_accounts WHERE id=?",
  )
    .bind(account.id)
    .first();
  if (
    !accountRow ||
    !password ||
    !(await passwordDigest(password, accountRow.password_salt)).startsWith(
      accountRow.password_hash,
    )
  ) {
    return reply({ error: "Confirm your account password to move your edition." }, request, {
      status: 401,
    });
  }
  if (!(await transferOwner(env, body.session_id, account.email)))
    return reply({ error: "No active edition was found for this account." }, request, {
      status: 403,
    });
  const lastTransfer = await env.OBI_DB.prepare(
    "SELECT created_at FROM device_transfer_audit WHERE checkout_session_id=? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(body.session_id)
    .first();
  if (lastTransfer) {
    const waitMs = Date.parse(lastTransfer.created_at) + TRANSFER_COOLDOWN_MS - Date.now();
    if (Number.isFinite(waitMs) && waitMs > 0) {
      return reply(
        {
          error: `This edition was moved recently. Please wait ${Math.ceil(waitMs / 86400000)} day(s) or contact support.`,
        },
        request,
        { status: 429 },
      );
    }
  }
  const recentTransfers = await env.OBI_DB.prepare(
    "SELECT count(*) AS count FROM device_transfer_audit WHERE checkout_session_id=? AND created_at>?",
  )
    .bind(body.session_id, new Date(Date.now() - TRANSFER_MAX_WINDOW_MS).toISOString())
    .first();
  if (Number(recentTransfers?.count || 0) >= TRANSFER_MAX_PER_WINDOW) {
    return reply(
      { error: "This edition has reached its transfer limit. Please contact support." },
      request,
      { status: 429 },
    );
  }
  const from = env.ACCOUNT_FROM_EMAIL || env.GIFT_FROM_EMAIL;
  const url = new URL(request.url);
  const localTest =
    env.OBI_LOCAL_TRANSFER_TEST === "1" &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname);
  const emailConfigured = env.RESEND_API_KEY?.startsWith("re_") && Boolean(from);
  if (!emailConfigured && !localTest)
    return reply(
      {
        error:
          "Email verification is not configured. Please contact support to move your edition.",
      },
      request,
      { status: 503 },
    );
  const metadata = await requestDeviceMetadata(request);
  const deviceLabel = [metadata.platform, metadata.mobile ? "mobile" : "desktop", metadata.country]
    .filter(Boolean)
    .join(" / ");
  const recent = await env.OBI_DB.prepare(
    "SELECT count(*) AS count FROM device_transfer_challenges WHERE account_id=? AND created_at>?",
  )
    .bind(account.id, new Date(Date.now() - 3600000).toISOString())
    .first();
  if (Number(recent?.count || 0) >= 5)
    return reply({ error: "Too many verification requests. Please try again later." }, request, {
      status: 429,
    });
  const device = await env.OBI_DB.prepare(
    "SELECT device_hash FROM reader_devices WHERE checkout_session_id=?",
  )
    .bind(body.session_id)
    .first();
  if (!device || device.device_hash === "UNBOUND")
    return reply({ error: "This edition is ready to claim. Please retry the reader." }, request, {
      status: 409,
    });
  const id = `transfer_${await randomToken(24)}`;
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const code = String(bytes[0] % 100000000).padStart(8, "0");
  const now = new Date();
  await env.OBI_DB.prepare(
    "INSERT INTO device_transfer_challenges (id,account_id,checkout_session_id,old_device_hash,new_device_hash,code_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      account.id,
      body.session_id,
      device.device_hash,
      await hashDeviceToken(body.device_token),
      await hashDeviceToken(`${id}:${code}`),
      now.toISOString(),
      new Date(now.getTime() + 600000).toISOString(),
    )
    .run();
  if (localTest && !emailConfigured)
    return reply(
      {
        challengeId: id,
        localTest: true,
        testCode: code,
        message: "Local test only: use the verification code shown below.",
      },
      request,
    );
  try {
    const message = deviceTransferCodeEmail({ code, deviceLabel });
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [account.email],
        reply_to: "admin@readobiism.com",
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: "type", value: "device-transfer-code" }],
      }),
    });
    if (!sent.ok) throw new Error("Email provider rejected request");
  } catch {
    await env.OBI_DB.prepare("UPDATE device_transfer_challenges SET consumed_at=? WHERE id=?")
      .bind(new Date().toISOString(), id)
      .run();
    return reply(
      { error: "Could not send the verification code. Please try again or contact support." },
      request,
      { status: 503 },
    );
  }
  return reply(
    { challengeId: id, message: "A verification code was sent to your account email." },
    request,
  );
}

async function confirmDeviceTransfer(request, env) {
  if (!transferOriginAllowed(request))
    return reply({ error: "Request origin is not allowed." }, request, { status: 403 });
  if (!(await isFeatureEnabled(env, "device_transfer"))) {
    return reply({ error: "Device transfers are temporarily unavailable." }, request, {
      status: 503,
    });
  }
  const account = await accountFromRequest(request, env);
  if (!account)
    return reply({ error: "Please sign in before moving your edition." }, request, {
      status: 401,
    });
  const body = await request.json().catch(() => ({}));
  if (
    !/^transfer_[A-Za-z0-9]{12,48}$/.test(body.challenge_id || "") ||
    !/^\d{8}$/.test(body.code || "") ||
    !validDeviceToken(body.device_token)
  )
    return reply({ error: "Enter the eight-digit verification code." }, request, { status: 400 });
  const now = new Date().toISOString();
  const challenge = await env.OBI_DB.prepare(
    "UPDATE device_transfer_challenges SET attempts=attempts+1 WHERE id=? AND account_id=? AND consumed_at IS NULL AND expires_at>? AND attempts<5 RETURNING *",
  )
    .bind(body.challenge_id, account.id, now)
    .first();
  if (
    !challenge ||
    !same(challenge.code_hash, await hashDeviceToken(`${body.challenge_id}:${body.code}`)) ||
    !same(challenge.new_device_hash, await hashDeviceToken(body.device_token))
  )
    return reply(
      { error: "The code is invalid or expired. Request a new code if needed." },
      request,
      { status: 400 },
    );
  if (!(await transferOwner(env, challenge.checkout_session_id, account.email)))
    return reply({ error: "No active edition was found for this account." }, request, {
      status: 403,
    });
  const consumed = await env.OBI_DB.prepare(
    "UPDATE device_transfer_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL RETURNING id",
  )
    .bind(now, challenge.id)
    .first();
  if (!consumed)
    return reply({ error: "This code has already been used." }, request, { status: 409 });
  const metadataJson = JSON.stringify(await requestDeviceMetadata(request));
  const result = await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "UPDATE reader_devices SET device_hash=?, claimed_at=?, metadata_json=? WHERE checkout_session_id=? AND device_hash=? AND EXISTS (SELECT 1 FROM purchases WHERE checkout_session_id=? AND status='active')",
    ).bind(
      challenge.new_device_hash,
      now,
      metadataJson,
      challenge.checkout_session_id,
      challenge.old_device_hash,
      challenge.checkout_session_id,
    ),
    env.OBI_DB.prepare(
      "UPDATE reader_state SET device_hash=? WHERE checkout_session_id=? AND device_hash=?",
    ).bind(challenge.new_device_hash, challenge.checkout_session_id, challenge.old_device_hash),
    env.OBI_DB.prepare(
      "UPDATE book_feedback SET device_hash=? WHERE checkout_session_id=? AND device_hash=?",
    ).bind(challenge.new_device_hash, challenge.checkout_session_id, challenge.old_device_hash),
    env.OBI_DB.prepare(
      "INSERT INTO device_transfer_audit (id,account_id,checkout_session_id,old_device_hash,new_device_hash,metadata_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM reader_devices WHERE checkout_session_id=? AND device_hash=?)",
    ).bind(
      `audit_${await randomToken(18)}`,
      account.id,
      challenge.checkout_session_id,
      challenge.old_device_hash,
      challenge.new_device_hash,
      metadataJson,
      now,
      challenge.checkout_session_id,
      challenge.new_device_hash,
    ),
  ]);
  if (!result[0]?.meta?.changes)
    return reply({ error: "The active device changed. Please start again." }, request, {
      status: 409,
    });
  const from = env.ACCOUNT_FROM_EMAIL || env.GIFT_FROM_EMAIL;
  if (env.RESEND_API_KEY?.startsWith("re_") && from) {
    try {
      const meta = JSON.parse(metadataJson);
      const label = [meta.platform, meta.mobile ? "mobile" : "desktop", meta.country]
        .filter(Boolean)
        .join(" / ");
      const message = deviceMovedEmail({
        deviceLabel: label,
        link: `${publicOrigin(env)}/reader`,
      });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [account.email],
          reply_to: "admin@readobiism.com",
          subject: message.subject,
          html: message.html,
          text: message.text,
          tags: [{ name: "type", value: "device-transfer-complete" }],
        }),
      });
    } catch (error) {
      console.error("Transfer notice email failed", error);
    }
  }
  return reply({ access: true, message: "Your edition has been moved to this browser." }, request);
}

/** Buyer's confirmation page: returns the gift code once payment has landed. */
async function giftStatus(request, env) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!validSessionId(sessionId))
    return reply({ error: "Invalid gift reference" }, request, { status: 400 });
  await ensure(env);
  const findGift = () => env.OBI_DB.prepare(
    "SELECT code, recipient_name, recipient_email, message, status, created_at, redeemed_at FROM gift_orders WHERE checkout_session_id=?",
  ).bind(sessionId).first();
  let gift = await findGift();
  // Verify with Paystack when the buyer returns before the webhook arrives.
  if (!gift && sessionId.startsWith("obi_") && env.PAYSTACK_SECRET_KEY) {
    const verified = await verifyAndRecordPaystack(request, env, sessionId);
    if (verified.ok) gift = await findGift();
  }
  if (!gift) {
    return reply(
      { pending: true, error: "Your gift is still being prepared. Please retry in a moment." },
      request,
      { status: 404 },
    );
  }
  return reply(
    {
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
    },
    request,
  );
}

/** Recipient unlocks the purchased edition with the code + the email it was sent to. */
async function redeemGift(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = normalizeGiftCode(body.code);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const deviceToken = body.device_token;
  if (!validGiftCode(code))
    return reply({ error: "Enter a valid gift code, for example OBI-7K2M-P9QX-4HWD." }, request, {
      status: 400,
    });
  if (!validEmail(email))
    return reply({ error: "Enter the email address this gift was sent to." }, request, {
      status: 400,
    });
  if (!validDeviceToken(deviceToken))
    return reply({ error: "A secure reader device is required" }, request, { status: 400 });
  await ensure(env);
  const rateLimited =
    (await enforceLimit(request, env, "gift-redeem", "gift-redeem-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "gift-redeem", "gift-redeem-code", code));
  if (rateLimited) return rateLimited;

  const gift = await env.OBI_DB.prepare(
    "SELECT code, checkout_session_id, recipient_email, status FROM gift_orders WHERE code=?",
  )
    .bind(code)
    .first();
  if (!gift)
    return reply(
      { error: "That gift code was not found. Check the code and try again." },
      request,
      { status: 404 },
    );
  if (gift.status === "revoked")
    return reply(
      { error: "This gift code has been cancelled. Contact support for help." },
      request,
      { status: 403 },
    );
  if (gift.recipient_email !== email) {
    return reply(
      {
        error: "Use the email address this gift was sent to. The code only works for that inbox.",
      },
      request,
      { status: 403 },
    );
  }
  if (!(await activePurchase(env, gift.checkout_session_id))) {
    return reply(
      { error: "This gift payment is not active yet. Please retry in a moment." },
      request,
      { status: 409 },
    );
  }

  const deviceHash = await hashDeviceToken(deviceToken);
  const bound = await env.OBI_DB.prepare(
    "SELECT device_hash FROM reader_devices WHERE checkout_session_id=?",
  )
    .bind(gift.checkout_session_id)
    .first();
  const boundElsewhere =
    bound && bound.device_hash !== "UNBOUND" && !same(bound.device_hash, deviceHash);

  if (gift.status === "redeemed") {
    if (bound && same(bound.device_hash, deviceHash)) {
      return reply({ session_id: gift.checkout_session_id, alreadyRedeemed: true }, request);
    }
    if (boundElsewhere)
      return reply({ error: "This gift has already been opened on another device." }, request, {
        status: 409,
      });
    // A prior redemption may have been interrupted before the device was bound.
  } else if (gift.status !== "active") {
    return reply({ error: "This gift code is no longer available." }, request, { status: 409 });
  } else {
    const claimed = await env.OBI_DB.prepare(
      "UPDATE gift_orders SET status='redeemed', redeemed_at=? WHERE code=? AND status='active'",
    )
      .bind(new Date().toISOString(), code)
      .run();
    if ((claimed?.meta?.changes ?? 0) === 0) {
      return reply({ error: "This gift code has already been redeemed." }, request, {
        status: 409,
      });
    }
  }

  if (!bound) {
    await env.OBI_DB.prepare(
      "INSERT OR IGNORE INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)",
    )
      .bind(gift.checkout_session_id, deviceHash, new Date().toISOString())
      .run();
  } else if (bound.device_hash === "UNBOUND") {
    await env.OBI_DB.prepare(
      "UPDATE reader_devices SET device_hash=?, claimed_at=? WHERE checkout_session_id=? AND device_hash='UNBOUND'",
    )
      .bind(deviceHash, new Date().toISOString(), gift.checkout_session_id)
      .run();
  }
  try {
    const metadataJson = JSON.stringify(await requestDeviceMetadata(request));
    await env.OBI_DB.prepare(
      "UPDATE reader_devices SET metadata_json=? WHERE checkout_session_id=?",
    )
      .bind(metadataJson, gift.checkout_session_id)
      .run();
  } catch {
    /* metadata is optional */
  }

  return reply({ session_id: gift.checkout_session_id, redeemed: true }, request);
}

async function narration(request, env) {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  if (!env.ELEVENLABS_API_KEY?.startsWith("sk_"))
    return reply({ error: "Narration is not configured" }, request, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const sessionId = body.session_id;
  const deviceToken = body.device_token;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (
    !validSessionId(sessionId) ||
    !validDeviceToken(deviceToken) ||
    !text ||
    text.length > 8000
  ) {
    return reply({ error: "Invalid narration request" }, request, { status: 400 });
  }
  await ensure(env);
  const rateLimited = await enforceLimit(
    request,
    env,
    "narration",
    "narration-device",
    deviceToken,
  );
  if (rateLimited) return rateLimited;
  if (!(await activePurchase(env, sessionId)))
    return reply({ error: "Reader access is not active" }, request, { status: 403 });
  const deviceHash = await hashDeviceToken(deviceToken);
  const boundDevice = await env.OBI_DB.prepare(
    "SELECT device_hash FROM reader_devices WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
  if (!boundDevice || !same(boundDevice.device_hash, deviceHash))
    return reply({ error: "Reader is not authorized on this device" }, request, { status: 403 });
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${NARRATOR_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_v4",
        voice_settings: {
          stability: 0.58,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!response.ok)
    return reply({ error: "Narration service is temporarily unavailable" }, request, {
      status: 502,
    });
  return new Response(response.body, {
    status: 200,
    headers: {
      ...cors(request),
      "content-type": "audio/mpeg",
      "cache-control": "private, no-store",
    },
  });
}

function sectionMetadata(section) {
  const paragraphs = JSON.parse(section.paragraphs_json);
  const firstParagraph =
    paragraphs.find((paragraph) => paragraph.length > 80) ?? paragraphs[0] ?? "";
  return {
    id: section.section_id,
    label: section.label,
    title: section.title,
    kind: section.kind,
    summary:
      firstParagraph.length > 180 ? `${firstParagraph.slice(0, 177).trimEnd()}…` : firstParagraph,
  };
}

async function readerState(request, env) {
  const url = new URL(request.url);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const sessionId = url.searchParams.get("session_id") || body.session_id;
  const deviceToken = request.headers.get("x-obi-device-token") || body.device_token;
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken))
    return reply({ error: "Reader access is required" }, request, { status: 403 });
  await ensure(env);
  const rateLimited =
    (await enforceLimit(request, env, "state", "state-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "state", "state-device", deviceToken));
  if (rateLimited) return rateLimited;
  if (!(await activePurchase(env, sessionId)))
    return reply({ error: "Reader access is not active" }, request, { status: 403 });
  const deviceHash = await hashDeviceToken(deviceToken);
  const bound = await env.OBI_DB.prepare(
    "SELECT device_hash FROM reader_devices WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
  if (!bound || !same(bound.device_hash, deviceHash))
    return reply({ error: "Reader is not authorized on this device" }, request, { status: 403 });
  if (request.method === "GET") {
    const rows = await env.OBI_DB.prepare(
      "SELECT section_id,bookmark,note,progress,updated_at FROM reader_state WHERE checkout_session_id=? AND device_hash=? ORDER BY updated_at DESC",
    )
      .bind(sessionId, deviceHash)
      .all();
    const items = rows.results || [];
    const last = items.find((item) => Number(item.progress) > 0) || items[0] || null;
    return reply({ items, last }, request);
  }
  if (request.method !== "POST")
    return reply({ error: "Method not allowed" }, request, { status: 405 });
  const sectionId = typeof body.section_id === "string" ? body.section_id.trim().slice(0, 80) : "";
  if (!sectionId) return reply({ error: "A section is required." }, request, { status: 400 });
  const section = await env.OBI_DB.prepare("SELECT 1 AS ok FROM book_sections WHERE section_id=?")
    .bind(sectionId)
    .first();
  if (!section)
    return reply({ error: "That section is not available." }, request, { status: 404 });
  const existing = await env.OBI_DB.prepare(
    "SELECT bookmark,note,progress FROM reader_state WHERE checkout_session_id=? AND device_hash=? AND section_id=?",
  )
    .bind(sessionId, deviceHash, sectionId)
    .first();
  const bookmark =
    body.bookmark === undefined ? Number(existing?.bookmark || 0) : body.bookmark ? 1 : 0;
  const note =
    body.note === undefined
      ? String(existing?.note || "")
      : typeof body.note === "string"
        ? body.note.trim().slice(0, 4000)
        : "";
  const progress =
    body.progress === undefined
      ? Number(existing?.progress || 0)
      : Math.min(1, Math.max(0, Number(body.progress) || 0));
  const now = new Date().toISOString();
  await env.OBI_DB.prepare(
    `INSERT INTO reader_state (checkout_session_id,device_hash,section_id,bookmark,note,progress,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(checkout_session_id,device_hash,section_id) DO UPDATE SET bookmark=excluded.bookmark,note=excluded.note,progress=excluded.progress,updated_at=excluded.updated_at`,
  )
    .bind(sessionId, deviceHash, sectionId, bookmark, note, progress, now)
    .run();
  return reply(
    { saved: true, state: { section_id: sectionId, bookmark, note, progress, updated_at: now } },
    request,
  );
}

async function readerFeedback(request, env) {
  const url = new URL(request.url);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const sessionId = url.searchParams.get("session_id") || body.session_id;
  const deviceToken = request.headers.get("x-obi-device-token") || body.device_token;
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken))
    return reply({ error: "Reader access is required" }, request, { status: 403 });
  if (request.method === "POST" && !(await isFeatureEnabled(env, "reader_feedback"))) {
    return reply({ error: "Reader feedback is temporarily unavailable." }, request, {
      status: 503,
    });
  }
  await ensure(env);
  const rateLimited =
    (await enforceLimit(request, env, "feedback", "feedback-ip", clientIp(request))) ||
    (await enforceLimit(request, env, "feedback", "feedback-device", deviceToken));
  if (rateLimited) return rateLimited;
  if (!(await activePurchase(env, sessionId)))
    return reply({ error: "Reader access is not active" }, request, { status: 403 });
  const deviceHash = await hashDeviceToken(deviceToken);
  const bound = await env.OBI_DB.prepare(
    "SELECT device_hash FROM reader_devices WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
  if (!bound || !same(bound.device_hash, deviceHash))
    return reply({ error: "Reader is not authorized on this device" }, request, { status: 403 });
  const summaryRow = async () =>
    env.OBI_DB.prepare(
      "SELECT count(*) AS count, round(avg(rating),2) AS average FROM book_feedback",
    ).first();
  if (request.method === "GET") {
    const feedback = await env.OBI_DB.prepare(
      "SELECT rating,comment,created_at,updated_at FROM book_feedback WHERE checkout_session_id=? AND device_hash=?",
    )
      .bind(sessionId, deviceHash)
      .first();
    const summary = await summaryRow();
    return reply(
      {
        feedback: feedback || null,
        summary: { count: Number(summary?.count || 0), average: Number(summary?.average || 0) },
      },
      request,
    );
  }
  if (request.method !== "POST")
    return reply({ error: "Method not allowed" }, request, { status: 405 });
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return reply({ error: "Choose a rating from 1 to 5." }, request, { status: 400 });
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : "";
  const purchase = await env.OBI_DB.prepare(
    "SELECT purchaser_email FROM purchases WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
  const now = new Date().toISOString();
  await env.OBI_DB.prepare(
    `INSERT INTO book_feedback (id,checkout_session_id,device_hash,purchaser_email,rating,comment,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(checkout_session_id,device_hash) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,updated_at=excluded.updated_at`,
  )
    .bind(
      `fb_${await randomToken(18)}`,
      sessionId,
      deviceHash,
      purchase?.purchaser_email || "",
      rating,
      comment,
      now,
      now,
    )
    .run();
  const feedback = await env.OBI_DB.prepare(
    "SELECT rating,comment,created_at,updated_at FROM book_feedback WHERE checkout_session_id=? AND device_hash=?",
  )
    .bind(sessionId, deviceHash)
    .first();
  const summary = await summaryRow();
  return reply(
    {
      saved: true,
      feedback,
      summary: { count: Number(summary?.count || 0), average: Number(summary?.average || 0) },
    },
    request,
  );
}

async function readerSearch(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const deviceToken = request.headers.get("x-obi-device-token") || url.searchParams.get("device_token");
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken))
    return reply({ error: "Reader access is required" }, request, { status: 403 });
  const q = String(url.searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 200)
    return reply({ error: "Enter a search query between 2 and 200 characters." }, request, { status: 400 });
  await ensure(env);
  const ipLimited = await enforceLimit(request, env, "reader", "reader-ip", clientIp(request));
  if (ipLimited) return ipLimited;
  if (!(await activePurchase(env, sessionId))) return accessDenied(env, request, sessionId);
  const deviceHash = await hashDeviceToken(deviceToken);
  const device = await env.OBI_DB.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").bind(sessionId).first();
  if (!device || !same(device.device_hash, deviceHash))
    return reply({ error: "Reader is not authorized on this device" }, request, { status: 403 });
  const deviceLimited = await enforceLimit(request, env, "reader", "reader-device", deviceToken);
  if (deviceLimited) return deviceLimited;
  await ensureSearchIndex(env);
  return reply(await searchContent(env, q, sessionId), request);
}

async function adminReindexSearch(request, env) {
  const admin = await accountFromRequest(request, env);
  if (!admin) return reply({ error: "Administrator sign-in required." }, request, { status: 401 });
  await ensure(env);
  const result = await reindexSearchIndex(env);
  return reply({ reindexed: true, inserted: result.inserted }, request);
}

async function reader(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const deviceToken =
    request.headers.get("x-obi-device-token") || url.searchParams.get("device_token");
  const sectionId = url.searchParams.get("section_id");
  if (!validSessionId(sessionId) || !validDeviceToken(deviceToken))
    return reply({ error: "Reader access is required" }, request, { status: 403 });
  await ensure(env);
  const ipLimited = await enforceLimit(request, env, "reader", "reader-ip", clientIp(request));
  if (ipLimited) return ipLimited;
  if (!(await activePurchase(env, sessionId))) return accessDenied(env, request, sessionId);
  const deviceHash = await hashDeviceToken(deviceToken);
  const boundDevice = await env.OBI_DB.prepare(
    "SELECT device_hash,metadata_json FROM reader_devices WHERE checkout_session_id=?",
  )
    .bind(sessionId)
    .first();
  if (!boundDevice || !same(boundDevice.device_hash, deviceHash))
    return reply({ error: "Reader is not authorized on this device" }, request, { status: 403 });
  let deviceLabel = "";
  try {
    const meta = JSON.parse(boundDevice.metadata_json || "{}");
    deviceLabel = [meta.platform, meta.mobile ? "mobile" : "desktop", meta.country]
      .filter(Boolean)
      .join(" · ");
  } catch {
    /* metadata is optional */
  }

  // Only licensed devices reach the content counters. Section requests get a
  // tighter scrape budget than catalogue/metadata refreshes.
  const deviceLimited =
    (await enforceLimit(request, env, "reader", "reader-device", deviceToken)) ||
    (sectionId
      ? await enforceLimit(request, env, "reader", "reader-sections", deviceToken)
      : null);
  if (deviceLimited) return deviceLimited;

  if (sectionId) {
    const section = await env.OBI_DB.prepare(
      "SELECT section_id, label, title, kind, paragraphs_json FROM book_sections WHERE section_id=?",
    )
      .bind(sectionId)
      .first();
    if (!section)
      return reply({ error: "This section is not available." }, request, { status: 404 });
    const paragraphs = JSON.parse(section.paragraphs_json);
    const hidden = encodeWatermark(sessionId);
    const marked = paragraphs.map((paragraph, index) =>
      index % 3 === 0 ? `${paragraph}${hidden}` : paragraph,
    );
    return reply({ chapter: { ...sectionMetadata(section), paragraphs: marked } }, request);
  }

  const sections = await env.OBI_DB.prepare(
    "SELECT section_id, label, title, kind, paragraphs_json FROM book_sections ORDER BY position ASC",
  ).all();
  if (!sections.results?.length)
    return reply(
      { error: "The protected edition is being prepared. Please retry shortly." },
      request,
      { status: 503 },
    );
  const purchase = await env.OBI_DB.prepare(
    `SELECT p.rowid AS copy_no,p.edition_no AS book_edition_no,p.expires_at,p.purchaser_email,p.reader_name,p.granted_at,
      e.label AS edition_label,
      g.recipient_email,g.recipient_name,g.status AS gift_status,a.phone AS account_phone
    FROM purchases p LEFT JOIN gift_orders g ON g.checkout_session_id=p.checkout_session_id
    LEFT JOIN obi_accounts a ON lower(a.email)=lower(p.purchaser_email)
    LEFT JOIN editions e ON e.edition_no=p.edition_no
    WHERE p.checkout_session_id=?`,
  )
    .bind(sessionId)
    .first();
  const giftLicense = purchase?.gift_status === "redeemed" && purchase?.recipient_email;
  const purchaserEmail = purchase?.purchaser_email || "";
  const licenseEmail = giftLicense
    ? purchase.recipient_email
    : /@phone\.obiism\.local$/i.test(purchaserEmail)
      ? ""
      : purchaserEmail;
  const licensePhone = giftLicense ? "" : purchase?.account_phone || "";
  const licenseName = giftLicense ? purchase.recipient_name || "" : purchase?.reader_name || "";
  const editionYear = new Date(purchase?.granted_at || Date.now()).getUTCFullYear();
  const copyNo = Number(purchase?.copy_no);
  const bookEditionNo = Number(purchase?.book_edition_no);
  const edition =
    Number.isInteger(copyNo) && copyNo > 0
      ? `OBI-${editionYear}-${String(copyNo).padStart(6, "0")}`
      : "";
  const editionLabel =
    purchase?.edition_label || (Number.isInteger(bookEditionNo) && bookEditionNo > 0 ? `Edition ${bookEditionNo}` : "");
  return reply(
    {
      title: "OBI-ISM",
      subtitle: "Building a Just Society Through Character",
      authors: "Eze Echesi & Mpamugo",
      license: {
        email: licenseEmail,
        phone: licensePhone,
        name: licenseName,
        edition,
        edition_label: editionLabel,
        expires_at: purchase?.expires_at || "",
        device: deviceLabel,
        reference: sessionId.slice(-8).toUpperCase(),
        granted_at: purchase?.granted_at || "",
      },
      chapters: sections.results.map(sectionMetadata),
    },
    request,
  );
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
  reindexSearchIndex,
  searchContent,
};

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      // Never let an exception surface as an opaque Cloudflare 1101 page:
      // the browser cannot parse that, so the UI shows a generic failure.
      console.error("Unhandled worker error:", error && error.stack ? error.stack : error);
      return reply(
        { error: "The edition service hit an unexpected error. Please try again." },
        request,
        { status: 500 },
      );
    }
  },
};

async function handleRequest(request, env) {
  if (env.OBI_DEV_ORIGINS) {
    devOrigins.clear();
    String(env.OBI_DEV_ORIGINS)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => devOrigins.add(value));
  }
  const path = new URL(request.url).pathname;
  if (path === "/api/internal/local-mysql/account") {
    const { applyLocalMysqlAccount } = await import("./api/src/local-mysql-sync.js");
    return applyLocalMysqlAccount(request, env, ensure);
  }
  if (path.startsWith("/api/admin/")) return handleAdminAuth(request, env);
  if (request.method === "OPTIONS" && path.startsWith("/api/"))
    return new Response(null, {
      status: 204,
      headers: {
        ...cors(request),
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, x-obi-device-token",
      },
    });
  if (path === "/api/health") return json({ status: "ok", service: "obi-ism-payments" });
  if (path === "/api/auth/config" && request.method === "GET")
    return reply(
      { googleClientId: env.GOOGLE_CLIENT_ID || "", features: await getFeatureFlags(env) },
      request,
    );
  if (path === "/api/features" && request.method === "GET")
    return reply({ features: await getFeatureFlags(env) }, request);
  if (path === "/api/pricing" && request.method === "GET")
    return reply(await getPricing(env), request);
  if (path === "/api/account/register" && request.method === "POST")
    return registerAccount(request, env);
  if (path === "/api/account/login" && request.method === "POST")
    return loginAccount(request, env);
  if (path === "/api/account/google" && request.method === "POST")
    return googleLogin(request, env);
  if (path === "/api/account/phone/register" && request.method === "POST")
    return registerPhoneAccount(request, env);
  if (path === "/api/account/phone/login" && request.method === "POST")
    return loginPhoneAccount(request, env);
  if (path === "/api/account/password/forgot" && request.method === "POST")
    return forgotPassword(request, env);
  if (path === "/api/account/password/reset" && request.method === "POST")
    return resetPassword(request, env);
  if (path === "/api/account/password/change" && request.method === "POST")
    return changeAccountPassword(request, env);
  if (path === "/api/account/access" && request.method === "GET")
    return accountAccess(request, env);
  if (path === "/api/account/verify/request" && request.method === "POST") {
    const account = await accountFromRequest(request, env);
    if (!account) return reply({ error: "Sign in required" }, request, { status: 401 });
    await ensure(env);
    const url = new URL(request.url);
    const localTest =
      env.OBI_LOCAL_TRANSFER_TEST === "1" &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
    const result = await sendAccountVerification(env, account, { localTest });
    return reply(result.body, request, { status: result.status });
  }
  if (path === "/api/account/verify/confirm" && request.method === "POST") {
    const account = await accountFromRequest(request, env);
    if (!account) return reply({ error: "Sign in required" }, request, { status: 401 });
    await ensure(env);
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "")
      .replace(/\D/g, "")
      .slice(0, 8);
    if (code.length !== 8) return reply({ error: "Invalid code" }, request, { status: 400 });
    const ch = await env.OBI_DB.prepare(
      "SELECT * FROM account_verification_challenges WHERE account_id=? AND consumed_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(account.id, new Date().toISOString())
      .first();
    if (!ch) return reply({ error: "No valid challenge" }, request, { status: 400 });
    if (ch.attempts >= 5) return reply({ error: "Too many attempts" }, request, { status: 429 });
    if (!(await same(ch.code_hash, await hashDeviceToken(`${ch.id}:${code}`)))) {
      await env.OBI_DB.prepare(
        "UPDATE account_verification_challenges SET attempts=attempts+1 WHERE id=?",
      )
        .bind(ch.id)
        .run();
      return reply({ error: "Invalid code" }, request, { status: 400 });
    }
    await env.OBI_DB.batch([
      env.OBI_DB.prepare(
        "UPDATE account_verification_challenges SET consumed_at=? WHERE id=?",
      ).bind(new Date().toISOString(), ch.id),
      env.OBI_DB.prepare("UPDATE obi_accounts SET email_verified=1 WHERE id=?").bind(account.id),
    ]);
    return reply({ verified: true }, request);
  }
  if (path === "/api/stripe/webhook") return webhook(request, env);
  if (path === "/api/paystack/webhook" && request.method === "POST")
    return paystackWebhook(request, env);
  if (path === "/api/checkout" && request.method === "POST") return checkout(request, env);
  if (path === "/api/bulk/seats" && request.method === "GET") return bulkSeats(request, env);
  if (path === "/api/bulk/seats/assign" && request.method === "POST")
    return bulkSeats(request, env);
  if (path === "/api/bulk/seats/revoke" && request.method === "POST")
    return bulkSeats(request, env);
  if (path === "/api/bulk/seat/claim" && request.method === "POST")
    return claimBulkSeatEndpoint(request, env);
  if (path === "/api/bulk" && request.method === "POST") return createBulkOrder(request, env);
  if (path === "/api/bulk/verify" && request.method === "POST")
    return verifyBulkOrder(request, env);
  if (path === "/api/bulk/claim" && request.method === "POST")
    return claimBulkOrderEndpoint(request, env);
  if (path === "/api/bulk/local/redeem" && request.method === "POST")
    return redeemLocalBulk(request, env);
  if (path === "/api/gift" && request.method === "GET") return giftStatus(request, env);
  if (path === "/api/gift/redeem" && request.method === "POST") return redeemGift(request, env);
  if (path === "/api/reader/claim" && request.method === "POST") return claimReader(request, env);
  if (path === "/api/reader/transfer/start" && request.method === "POST")
    return startDeviceTransfer(request, env);
  if (path === "/api/reader/transfer/confirm" && request.method === "POST")
    return confirmDeviceTransfer(request, env);
  if (path === "/api/narration" && request.method === "POST") return narration(request, env);
  if (path === "/api/reader/state" && (request.method === "GET" || request.method === "POST"))
    return readerState(request, env);
  if (path === "/api/reader/feedback" && (request.method === "GET" || request.method === "POST"))
    return readerFeedback(request, env);
  if (path === "/api/reader" && request.method === "GET") return reader(request, env);
  if (path === "/api/reader/search" && request.method === "GET") return readerSearch(request, env);
  if (path === "/api/admin/search/reindex" && request.method === "POST")
    return adminReindexSearch(request, env);
  if (path === "/api/access" && request.method === "GET") {
    const sessionId = new URL(request.url).searchParams.get("session_id");
    if (!validSessionId(sessionId)) return reply({ access: false }, request, { status: 400 });
    return reply({ access: Boolean(await activePurchase(env, sessionId)) }, request);
  }
  return json({ error: "Not found" }, { status: 404 });
}
