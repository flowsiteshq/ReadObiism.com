// Production bulk orders (Stripe USD / Paystack NGN). Verified payments only.
import { hashDeviceToken } from "./security.js";
import { bulkReceiptEmail } from "./email-templates.js";
import { EDITION_SKU } from "./pricing.js";
import { getPricing, getAccessDays, accessExpiry } from "./pricing-store.js";
import { liveEdition } from "./edition-store.js";

export const bulkOrdersSchema = `
CREATE TABLE IF NOT EXISTS bulk_orders (
  id TEXT PRIMARY KEY,
  code_hash TEXT UNIQUE NOT NULL,
  code_last4 TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_account_id TEXT,
  receipt_email TEXT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
  currency TEXT NOT NULL CHECK(currency IN ('USD','NGN')),
  unit_amount_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('stripe','paystack')),
  provider_reference TEXT UNIQUE,
  stripe_session_id TEXT UNIQUE,
  code_encrypted TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','paid','expired','cancelled','refunded','disputed','partially_refunded')),
  claims_open INTEGER NOT NULL DEFAULT 1,
  paused_at TEXT,
  revoked_at TEXT,
  receipt_sent_at TEXT,
  discount_percentage INTEGER,
  discount_note TEXT,
  discount_approved_by TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bulk_order_claims (
  order_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  checkout_session_id TEXT UNIQUE NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY(order_id, account_id)
);
CREATE INDEX IF NOT EXISTS bulk_order_claims_order_idx ON bulk_order_claims(order_id);
CREATE INDEX IF NOT EXISTS bulk_order_claims_account_idx ON bulk_order_claims(account_id);
CREATE TABLE IF NOT EXISTS bulk_seats (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  seat_no INTEGER NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  token_encrypted TEXT,
  recipient_label TEXT,
  recipient_email TEXT,
  recipient_phone TEXT,
  status TEXT NOT NULL CHECK(status IN ('available','claimed','revoked')),
  claimed_by_account TEXT,
  claim_reference TEXT UNIQUE,
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  revoked_at TEXT,
  UNIQUE(order_id, seat_no)
);
CREATE INDEX IF NOT EXISTS bulk_seats_order_idx ON bulk_seats(order_id, status);
CREATE TABLE IF NOT EXISTS bulk_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
`;

const ensuredBulkOrders = new WeakSet();

export async function ensureBulkOrders(env) {
  if (!env?.OBI_DB || ensuredBulkOrders.has(env.OBI_DB)) return;
  // D1's exec() has rejected this multi-statement string in production, so
  // run each statement through a prepared statement instead.
  for (const statement of bulkOrdersSchema
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await env.OBI_DB.prepare(statement).bind().run();
  }
  const columns = await env.OBI_DB.prepare("PRAGMA table_info(bulk_orders)").bind().all();
  const columnNames = new Set((columns.results || []).map((column) => column.name));
  if (!columnNames.has("code_encrypted"))
    throw new Error("Bulk order schema requires the code_encrypted migration");
  if (!columnNames.has("buyer_account_id")) {
    await env.OBI_DB.prepare("ALTER TABLE bulk_orders ADD COLUMN buyer_account_id TEXT")
      .bind()
      .run();
  }
  if (!columnNames.has("receipt_email")) {
    await env.OBI_DB.prepare("ALTER TABLE bulk_orders ADD COLUMN receipt_email TEXT").bind().run();
  }
  if (!columnNames.has("claims_open")) {
    await env.OBI_DB.prepare(
      "ALTER TABLE bulk_orders ADD COLUMN claims_open INTEGER NOT NULL DEFAULT 1",
    )
      .bind()
      .run();
  }
  if (!columnNames.has("paused_at")) {
    await env.OBI_DB.prepare("ALTER TABLE bulk_orders ADD COLUMN paused_at TEXT").bind().run();
  }
  if (!columnNames.has("revoked_at")) {
    await env.OBI_DB.prepare("ALTER TABLE bulk_orders ADD COLUMN revoked_at TEXT").bind().run();
  }
  if (!columnNames.has("receipt_sent_at")) {
    await env.OBI_DB.prepare("ALTER TABLE bulk_orders ADD COLUMN receipt_sent_at TEXT")
      .bind()
      .run();
  }
  ensuredBulkOrders.add(env.OBI_DB);
}

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function generateCode() {
  // High entropy shareable code
  return "OBI-BULK-" + randomHex(24).toUpperCase();
}

async function hashCode(code) {
  return hashDeviceToken(code);
}

function validEmail(value) {
  return typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim());
}

function validQuantity(q) {
  return Number.isInteger(q) && q >= 1 && q <= 10000;
}

function computePrice(baseUnit, discount) {
  if (!discount) return { unit: baseUnit, total: baseUnit, discount: null };
  if (typeof discount !== "object") return null;
  const pct = Number(discount.percentage);
  if (!Number.isInteger(pct) || pct < 1 || pct > 99) return null;
  if (discount.confirmed !== true) return null;
  if (
    typeof discount.note !== "string" ||
    discount.note.trim().length < 3 ||
    discount.note.trim().length > 200
  )
    return null;
  const unit = Math.round((baseUnit * (100 - pct)) / 100);
  return { unit, discount: { percentage: pct, note: discount.note.trim() } };
}

export async function createBulkOrderCheckout(
  env,
  buyerEmail,
  quantity,
  provider,
  discount = null,
  actor = null,
  options = {},
) {
  const email = typeof buyerEmail === "string" ? buyerEmail.trim().toLowerCase() : "";
  const receiptEmail =
    typeof options.receiptEmail === "string" ? options.receiptEmail.trim().toLowerCase() : email;
  const buyerAccountId =
    typeof options.buyerAccountId === "string" ? options.buyerAccountId : null;
  if (!validEmail(email) || email.length > 254)
    return { status: 400, body: { error: "Enter a valid buyer email." } };
  if (
    !validEmail(receiptEmail) ||
    receiptEmail.length > 254 ||
    /@phone\.obiism\.local$/i.test(receiptEmail)
  ) {
    return {
      status: 400,
      body: { error: "Enter a real email address for your payment receipt." },
    };
  }
  if (!validQuantity(quantity))
    return { status: 400, body: { error: "Enter a quantity between 1 and 10000." } };
  if (provider !== "stripe" && provider !== "paystack")
    return { status: 400, body: { error: "Choose Stripe (USD) or Paystack (NGN)." } };

  if (!/^[a-f0-9]{64}$/i.test(env.BULK_CODE_ENCRYPTION_KEY || ""))
    return { status: 503, body: { error: "Bulk code recovery is not configured." } };
  await ensureBulkOrders(env);
  const pricing = await getPricing(env);

  if (provider === "paystack") {
    if (!env.PAYSTACK_SECRET_KEY?.startsWith("sk_"))
      return { status: 503, body: { error: "Paystack is not configured." } };
    const price = computePrice(pricing.NGN.minor, discount);
    if (!price)
      return {
        status: 400,
        body: { error: "Invalid discount. Enter 1-99%, approval note, and confirmation." },
      };
    const id = "bprod_" + randomHex(16);
    const reference = "bpo_" + randomHex(16);
    const total = price.unit * quantity;
    const now = new Date().toISOString();
    await env.OBI_DB.batch([
      env.OBI_DB.prepare(
        `INSERT INTO bulk_orders (id,code_hash,code_last4,buyer_email,buyer_account_id,receipt_email,quantity,currency,unit_amount_minor,total_minor,provider,provider_reference,status,discount_percentage,discount_note,discount_approved_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id,
        await hashCode(generateCode()),
        "XXXX",
        email,
        buyerAccountId,
        receiptEmail,
        quantity,
        "NGN",
        price.unit,
        total,
        "paystack",
        reference,
        "pending",
        price.discount?.percentage || null,
        price.discount?.note || null,
        actor,
        now,
        now,
      ),
      env.OBI_DB.prepare(
        "INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)",
      ).bind(
        "boe_" + randomHex(12),
        id,
        "created",
        actor,
        JSON.stringify({ quantity, currency: "NGN", total }),
        now,
      ),
    ]);
    try {
      const api = String(env.PAYSTACK_API_BASE || "https://api.paystack.co").replace(/\/+$/, "");
      const origin = env.OBI_PUBLIC_APP_URL || "https://readobiism.com";
      const callback = `${origin}/bulk-confirmation?order=${encodeURIComponent(id)}`;
      const resp = await fetch(api + "/transaction/initialize", {
        method: "POST",
        headers: {
          authorization: "Bearer " + env.PAYSTACK_SECRET_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: receiptEmail,
          amount: total,
          currency: "NGN",
          reference,
          callback_url: callback,
          metadata: {
            bulk_order: "1",
            bulk_order_id: id,
            quantity,
            product_sku: EDITION_SKU,
            purchaser_email: email,
            receipt_email: receiptEmail,
            ...(buyerAccountId ? { buyer_account_id: buyerAccountId } : {}),
          },
        }),
      });
      const result = await resp.json().catch(() => ({}));
      const checkout = result?.data?.authorization_url;
      let allowed = false;
      try {
        const u = new URL(checkout);
        allowed = u.protocol === "https:" && u.hostname === "checkout.paystack.com";
      } catch {}
      if (!resp.ok || !result.status || !allowed || result?.data?.reference !== reference)
        throw new Error("bad");
      return {
        status: 201,
        body: {
          order_id: id,
          checkout_url: checkout,
          provider: "paystack",
          currency: "NGN",
          total_minor: total,
          quantity,
        },
      };
    } catch {
      await env.OBI_DB.prepare(
        "UPDATE bulk_orders SET status='cancelled', updated_at=? WHERE id=? AND status='pending'",
      )
        .bind(new Date().toISOString(), id)
        .run();
      return { status: 502, body: { error: "Could not start Paystack checkout." } };
    }
  } else {
    if (!env.OBI_STRIPE_SECRET_KEY?.startsWith("sk_"))
      return { status: 503, body: { error: "Stripe is not configured." } };
    const price = computePrice(pricing.USD.minor, discount);
    if (!price)
      return {
        status: 400,
        body: { error: "Invalid discount. Enter 1-99%, approval note, and confirmation." },
      };
    const id = "bprod_" + randomHex(16);
    const now = new Date().toISOString();
    const total = price.unit * quantity;
    await env.OBI_DB.batch([
      env.OBI_DB.prepare(
        `INSERT INTO bulk_orders (id,code_hash,code_last4,buyer_email,buyer_account_id,receipt_email,quantity,currency,unit_amount_minor,total_minor,provider,status,discount_percentage,discount_note,discount_approved_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id,
        await hashCode(generateCode()),
        "XXXX",
        email,
        buyerAccountId,
        receiptEmail,
        quantity,
        "USD",
        price.unit,
        total,
        "stripe",
        "pending",
        price.discount?.percentage || null,
        price.discount?.note || null,
        actor,
        now,
        now,
      ),
      env.OBI_DB.prepare(
        "INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)",
      ).bind(
        "boe_" + randomHex(12),
        id,
        "created",
        actor,
        JSON.stringify({ quantity, currency: "USD", total }),
        now,
      ),
    ]);
    try {
      const origin = env.OBI_PUBLIC_APP_URL || "https://readobiism.com";
      const form = new URLSearchParams({
        mode: "payment",
        customer_email: receiptEmail,
        success_url: `${origin}/bulk-confirmation?order=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/bulk?cancelled=1`,
        client_reference_id: id,
        "metadata[bulk_order]": "1",
        "metadata[bulk_order_id]": id,
        "metadata[purchaser_email]": email,
        "metadata[receipt_email]": receiptEmail,
        ...(buyerAccountId ? { "metadata[buyer_account_id]": buyerAccountId } : {}),
        "metadata[quantity]": String(quantity),
        "metadata[product_sku]": EDITION_SKU,
        "line_items[0][quantity]": String(quantity),
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(price.unit),
        "line_items[0][price_data][product_data][name]": "OBI-ISM digital edition (bulk order)",
      });
      const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          authorization: "Bearer " + env.OBI_STRIPE_SECRET_KEY,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      const result = await resp.json().catch(() => ({}));
      let allowed = false;
      try {
        const u = new URL(result.url);
        allowed = u.protocol === "https:" && u.hostname === "checkout.stripe.com";
      } catch {}
      if (!resp.ok || !allowed || !/^cs_(test_|live_)[A-Za-z0-9_]{12,255}$/.test(result.id || ""))
        throw new Error("bad");
      await env.OBI_DB.prepare(
        "UPDATE bulk_orders SET stripe_session_id=?, updated_at=? WHERE id=?",
      )
        .bind(result.id, new Date().toISOString(), id)
        .run();
      return {
        status: 201,
        body: {
          order_id: id,
          checkout_url: result.url,
          provider: "stripe",
          currency: "USD",
          total_minor: total,
          quantity,
        },
      };
    } catch {
      await env.OBI_DB.prepare(
        "UPDATE bulk_orders SET status='cancelled', updated_at=? WHERE id=? AND status='pending'",
      )
        .bind(new Date().toISOString(), id)
        .run();
      return { status: 502, body: { error: "Could not start Stripe checkout." } };
    }
  }
}

const hexBytes = (bytes) =>
  [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
function fromHex(value) {
  if (typeof value !== "string" || value.length % 2 || !/^[a-f0-9]+$/i.test(value))
    throw new Error("Invalid encryption data");
  return Uint8Array.from(value.match(/../g), (byte) => parseInt(byte, 16));
}
async function bulkKey(env, usage) {
  if (!/^[a-f0-9]{64}$/i.test(env.BULK_CODE_ENCRYPTION_KEY || ""))
    throw new Error("Bulk code encryption is not configured");
  return crypto.subtle.importKey("raw", fromHex(env.BULK_CODE_ENCRYPTION_KEY), "AES-GCM", false, [
    usage,
  ]);
}
async function encryptCode(env, orderId, code) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(orderId) },
    await bulkKey(env, "encrypt"),
    new TextEncoder().encode(code),
  );
  return "v1." + hexBytes(iv) + "." + hexBytes(ciphertext);
}
async function decryptCode(env, orderId, stored) {
  const parts = String(stored || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^[a-f0-9]{24}$/i.test(parts[1]))
    throw new Error("Code unavailable");
  const text = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(parts[1]), additionalData: new TextEncoder().encode(orderId) },
    await bulkKey(env, "decrypt"),
    fromHex(parts[2]),
  );
  return new TextDecoder().decode(text);
}
async function issueCode(env, order) {
  const code = generateCode();
  const hash = await hashCode(code);
  const encrypted = await encryptCode(env, order.id, code);
  const now = new Date().toISOString();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "UPDATE bulk_orders SET code_hash=?, code_last4=?, code_encrypted=?, status='paid', paid_at=?, updated_at=? WHERE id=? AND status='pending'",
    ).bind(hash, code.slice(-4), encrypted, now, now, order.id),
    env.OBI_DB.prepare(
      "INSERT INTO bulk_order_events (id,order_id,event_type,details,created_at) SELECT ?,?,'paid',?,? WHERE EXISTS (SELECT 1 FROM bulk_orders WHERE id=? AND code_hash=? AND status='paid')",
    ).bind(
      "boe_" + randomHex(12),
      order.id,
      JSON.stringify({ code_last4: code.slice(-4) }),
      now,
      order.id,
      hash,
    ),
  ]);
  // Another verifier may have won the conditional update. Always return the
  // persisted code, never the locally generated losing candidate.
  const saved = await env.OBI_DB.prepare(
    "SELECT status,code_encrypted FROM bulk_orders WHERE id=?",
  )
    .bind(order.id)
    .first();
  if (saved?.status !== "paid") throw new Error("Order is not payable");
  return decryptCode(env, order.id, saved.code_encrypted);
}

async function sendBulkReceipt(env, orderId) {
  if (!env.RESEND_API_KEY?.startsWith("re_")) return false;
  const from = env.ACCOUNT_FROM_EMAIL || env.GIFT_FROM_EMAIL;
  if (!from) return false;
  const order = await env.OBI_DB.prepare(
    "SELECT id,status,quantity,receipt_email,buyer_email,revoked_at,receipt_sent_at FROM bulk_orders WHERE id=?",
  )
    .bind(orderId)
    .first();
  const to = String(order?.receipt_email || order?.buyer_email || "").toLowerCase();
  if (
    !order ||
    order.status !== "paid" ||
    order.revoked_at ||
    order.receipt_sent_at ||
    !validEmail(to) ||
    /@phone\.obiism\.local$/i.test(to)
  )
    return false;
  const now = new Date().toISOString();
  const claimed = await env.OBI_DB.prepare(
    "UPDATE bulk_orders SET receipt_sent_at=? WHERE id=? AND receipt_sent_at IS NULL AND status='paid' AND revoked_at IS NULL",
  )
    .bind(now, order.id)
    .run();
  if (!Number(claimed?.meta?.changes || 0)) return false;
  const origin = env.OBI_PUBLIC_APP_URL || "https://readobiism.com";
  const link = `${origin}/bulk-confirmation?order=${encodeURIComponent(order.id)}`;
  const message = bulkReceiptEmail({
    orderId: order.id,
    quantity: order.quantity,
    link,
    email: to,
  });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: "admin@readobiism.com",
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: "type", value: "bulk-receipt" }],
      }),
    });
    if (!response.ok) throw new Error("Receipt delivery failed");
    return true;
  } catch {
    await env.OBI_DB.prepare("UPDATE bulk_orders SET receipt_sent_at=NULL WHERE id=?")
      .bind(order.id)
      .run()
      .catch(() => {});
    return false;
  }
}

export async function verifyBulkOrderPayment(env, orderId) {
  if (!/^bprod_[a-f0-9]{32}$/.test(orderId || ""))
    return { status: 400, body: { error: "Invalid order." } };
  await ensureBulkOrders(env);
  const order = await env.OBI_DB.prepare("SELECT * FROM bulk_orders WHERE id=?")
    .bind(orderId)
    .first();
  if (!order) return { status: 404, body: { error: "Order not found." } };
  if (order.revoked_at)
    return { status: 409, body: { error: "This bulk code has been revoked. Contact support." } };
  if (order.status === "paid") {
    try {
      const code = await decryptCode(env, order.id, order.code_encrypted);
      await sendBulkReceipt(env, order.id).catch(() => {});
      const seatData =
        env.OBI_BULK_INDIVIDUAL_SEATS === "1" ? await seatsForOrder(env, order.id) : {};
      return {
        status: 200,
        body: {
          order_id: order.id,
          status: "paid",
          claims_open: Number(order.claims_open ?? 1),
          code,
          quantity: order.quantity,
          ...seatData,
        },
      };
    } catch {
      return { status: 503, body: { error: "Code recovery is unavailable. Contact support." } };
    }
  }
  if (order.status === "pending") {
    if (order.provider === "paystack") {
      if (!env.PAYSTACK_SECRET_KEY?.startsWith("sk_"))
        return { status: 503, body: { error: "Paystack not configured." } };
      try {
        const api = String(env.PAYSTACK_API_BASE || "https://api.paystack.co").replace(/\/+$/, "");
        const resp = await fetch(
          api + "/transaction/verify/" + encodeURIComponent(order.provider_reference),
          { headers: { authorization: "Bearer " + env.PAYSTACK_SECRET_KEY } },
        );
        const result = await resp.json();
        const tx = result?.data;
        if (!resp.ok || !result.status || !tx)
          return { status: 502, body: { error: "Could not verify payment." } };
        if (tx.status !== "success")
          return { status: 200, body: { order_id: order.id, status: "pending" } };
        const expectedReceipt = String(
          order.receipt_email || order.buyer_email || "",
        ).toLowerCase();
        if (
          tx.domain !== (env.PAYSTACK_SECRET_KEY.startsWith("sk_live_") ? "live" : "test") ||
          tx.reference !== order.provider_reference ||
          String(tx.currency).toUpperCase() !== order.currency ||
          Number(tx.amount) !== order.total_minor ||
          String(tx.customer?.email || "").toLowerCase() !== expectedReceipt
        ) {
          return { status: 400, body: { error: "Payment does not match order." } };
        }
        if (
          tx.metadata?.bulk_order_id !== order.id ||
          Number(tx.metadata?.quantity) !== order.quantity ||
          tx.metadata?.product_sku !== EDITION_SKU
        ) {
          return { status: 400, body: { error: "Payment does not match order." } };
        }
        const code = await issueCode(env, order);
        await sendBulkReceipt(env, order.id).catch(() => {});
        const seatData =
          env.OBI_BULK_INDIVIDUAL_SEATS === "1" ? await seatsForOrder(env, order.id) : {};
        return {
          status: 200,
          body: {
            order_id: order.id,
            status: "paid",
            claims_open: Number(order.claims_open ?? 1),
            code,
            quantity: order.quantity,
            ...seatData,
          },
        };
      } catch (e) {
        return { status: 502, body: { error: "Could not verify payment." } };
      }
    } else if (order.provider === "stripe") {
      if (!env.OBI_STRIPE_SECRET_KEY?.startsWith("sk_"))
        return { status: 503, body: { error: "Stripe not configured." } };
      try {
        const sid = order.stripe_session_id;
        if (!sid) return { status: 400, body: { error: "Missing session." } };
        const resp = await fetch(
          "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sid),
          { headers: { authorization: "Bearer " + env.OBI_STRIPE_SECRET_KEY } },
        );
        const session = await resp.json();
        if (!resp.ok || !session?.id)
          return { status: 502, body: { error: "Could not verify payment." } };
        if (session.status !== "complete" || session.payment_status !== "paid")
          return { status: 200, body: { order_id: order.id, status: "pending" } };
        if (
          session.id !== sid ||
          session.livemode !== env.OBI_STRIPE_SECRET_KEY.startsWith("sk_live_")
        )
          return { status: 400, body: { error: "Payment does not match order." } };
        if (session.livemode === true && env.OBI_STRIPE_LIVE_MODE !== "1")
          return { status: 400, body: { error: "Live payment not allowed in this environment." } };
        if (session.livemode !== true && env.OBI_STRIPE_REQUIRE_LIVE === "1")
          return { status: 400, body: { error: "Live payment required." } };
        const expectedReceipt = String(
          order.receipt_email || order.buyer_email || "",
        ).toLowerCase();
        if (
          String(session.currency || "").toUpperCase() !== order.currency ||
          Number(session.amount_total) !== order.total_minor ||
          String(session.customer_email || "").toLowerCase() !== expectedReceipt ||
          session.client_reference_id !== order.id ||
          session.metadata?.bulk_order_id !== order.id ||
          Number(session.metadata?.quantity) !== order.quantity ||
          session.metadata?.product_sku !== EDITION_SKU
        ) {
          return { status: 400, body: { error: "Payment does not match order." } };
        }
        const code = await issueCode(env, order);
        await sendBulkReceipt(env, order.id).catch(() => {});
        const seatData =
          env.OBI_BULK_INDIVIDUAL_SEATS === "1" ? await seatsForOrder(env, order.id) : {};
        return {
          status: 200,
          body: {
            order_id: order.id,
            status: "paid",
            claims_open: Number(order.claims_open ?? 1),
            code,
            quantity: order.quantity,
            ...seatData,
          },
        };
      } catch {
        return { status: 502, body: { error: "Could not verify payment." } };
      }
    }
  }
  return { status: 200, body: { order_id: order.id, status: order.status } };
}

export async function claimBulkOrder(env, account, codeInput, deviceHash) {
  const code = typeof codeInput === "string" ? codeInput.trim().toUpperCase() : "";
  if (!/^OBI-BULK-[A-F0-9]{48}$/.test(code))
    return { status: 400, body: { error: "Enter a valid bulk code." } };
  await ensureBulkOrders(env);
  const order = await env.OBI_DB.prepare(
    "SELECT id,quantity,status,currency,claims_open,revoked_at FROM bulk_orders WHERE code_hash=?",
  )
    .bind(await hashCode(code))
    .first();
  if (!order) return { status: 404, body: { error: "That bulk code was not found." } };
  if (order.status !== "paid")
    return { status: 409, body: { error: "This bulk order is not active yet." } };
  if (order.revoked_at)
    return { status: 409, body: { error: "This bulk code has been revoked. Contact support." } };
  if (Number(order.claims_open) === 0)
    return {
      status: 409,
      body: { error: "New claims are paused for this order. Contact the buyer." },
    };
  const seats = await env.OBI_DB.prepare(
    "SELECT count(*) AS count FROM bulk_seats WHERE order_id=?",
  )
    .bind(order.id)
    .first();
  if (Number(seats?.count || 0) > 0)
    return { status: 409, body: { error: "Use an individual seat link for this order." } };
  const existing = await env.OBI_DB.prepare(
    "SELECT checkout_session_id FROM bulk_order_claims WHERE order_id=? AND account_id=?",
  )
    .bind(order.id, account.id)
    .first();
  if (existing)
    return {
      status: 200,
      body: { session_id: existing.checkout_session_id, alreadyClaimed: true },
    };
  const reference = "obi_" + randomHex(16);
  const now = new Date().toISOString();
  const expiresAt = accessExpiry(await getAccessDays(env), new Date(now));
  const editionNo = (await liveEdition(env))?.edition_no || 1;
  const results = await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      `INSERT OR IGNORE INTO bulk_order_claims (order_id,account_id,checkout_session_id,claimed_at)
      SELECT id,?,?,? FROM bulk_orders WHERE id=? AND status='paid'
      AND (SELECT COUNT(*) FROM bulk_order_claims WHERE order_id=bulk_orders.id) < quantity`,
    ).bind(account.id, reference, now, order.id),
    env.OBI_DB.prepare(
      `INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at,expires_at,edition_no)
      SELECT checkout_session_id,?,?,0,?,?,'active',?,?,? FROM bulk_order_claims WHERE checkout_session_id=?`,
    ).bind("bulk-order:" + order.id, account.email, order.currency, EDITION_SKU, now, expiresAt, editionNo, reference),
    env.OBI_DB.prepare(
      `INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at)
      SELECT checkout_session_id,?,? FROM bulk_order_claims WHERE checkout_session_id=?`,
    ).bind(deviceHash, now, reference),
  ]);
  if (Number(results[0]?.meta?.changes || 0) > 0)
    return { status: 200, body: { session_id: reference, claimed: true } };
  const retry = await env.OBI_DB.prepare(
    "SELECT checkout_session_id FROM bulk_order_claims WHERE order_id=? AND account_id=?",
  )
    .bind(order.id, account.id)
    .first();
  return retry
    ? { status: 200, body: { session_id: retry.checkout_session_id, alreadyClaimed: true } }
    : { status: 409, body: { error: "All activations for this bulk code have been used." } };
}

export const MAX_INDIVIDUAL_SEATS = 500;

/**
 * Generate one encrypted seat token per copy, up to the per-seat UI limit.
 * The shared code remains available for larger orders.
 */
export async function ensureBulkSeats(env, order) {
  await ensureBulkOrders(env);
  if (!order || order.status !== "paid") return;
  const quantity = Number(order.quantity) || 0;
  if (quantity > MAX_INDIVIDUAL_SEATS) return;
  const target = quantity;
  if (!target) return;
  const existing = await env.OBI_DB.prepare("SELECT seat_no FROM bulk_seats WHERE order_id=?")
    .bind(order.id)
    .all();
  const present = new Set((existing.results || []).map((row) => Number(row.seat_no)));
  const now = new Date().toISOString();
  const statements = [];
  for (let seatNo = 1; seatNo <= target; seatNo += 1) {
    if (present.has(seatNo)) continue;
    const token = "seat_" + randomHex(24);
    const encrypted = await encryptCode(env, `${order.id}:seat:${seatNo}`, token);
    statements.push(
      env.OBI_DB.prepare(
        `INSERT OR IGNORE INTO bulk_seats
        (id,order_id,seat_no,token_hash,token_encrypted,status,created_at)
        VALUES (?,?,?,?,?,'available',?)`,
      ).bind(`seat_${randomHex(12)}`, order.id, seatNo, await hashCode(token), encrypted, now),
    );
  }
  for (let index = 0; index < statements.length; index += 50) {
    await env.OBI_DB.batch(statements.slice(index, index + 50));
  }
}

function publicSeat(row, link) {
  return {
    seat_no: Number(row.seat_no),
    status: row.status,
    recipient_label: row.recipient_label || "",
    recipient_email: row.recipient_email || "",
    recipient_phone: row.recipient_phone || "",
    claimed_at: row.claimed_at || null,
    revoked_at: row.revoked_at || null,
    link,
  };
}

export async function seatsForOrder(env, orderId) {
  await ensureBulkOrders(env);
  const order = await env.OBI_DB.prepare(
    "SELECT id,quantity,status,currency FROM bulk_orders WHERE id=?",
  )
    .bind(orderId)
    .first();
  if (!order) return null;
  if (order.status !== "paid")
    return { seats: [], limited: false, max_individual: MAX_INDIVIDUAL_SEATS };
  if (Number(order.quantity) > MAX_INDIVIDUAL_SEATS)
    return { seats: [], limited: true, max_individual: MAX_INDIVIDUAL_SEATS };
  await ensureBulkSeats(env, order);
  const rows = await env.OBI_DB.prepare(
    `SELECT seat_no,token_encrypted,status,recipient_label,recipient_email,recipient_phone,claimed_at,revoked_at
    FROM bulk_seats WHERE order_id=? ORDER BY seat_no`,
  )
    .bind(order.id)
    .all();
  const origin = String(env.OBI_PUBLIC_APP_URL || "https://readobiism.com").replace(/\/+$/, "");
  const seats = [];
  for (const row of rows.results || []) {
    let link = "";
    try {
      const token = await decryptCode(env, `${order.id}:seat:${row.seat_no}`, row.token_encrypted);
      link = `${origin}/bulk-redeem?seat=${encodeURIComponent(token)}`;
    } catch {
      /* A lost key leaves the seat unavailable for link delivery. */
    }
    seats.push(publicSeat(row, link));
  }
  return {
    seats,
    limited: Number(order.quantity) > MAX_INDIVIDUAL_SEATS,
    max_individual: MAX_INDIVIDUAL_SEATS,
  };
}

export async function assignBulkSeat(env, orderId, seatNo, input = {}, actor = "") {
  await ensureBulkOrders(env);
  const order = await env.OBI_DB.prepare("SELECT id,quantity,status FROM bulk_orders WHERE id=?")
    .bind(orderId)
    .first();
  if (!order) return { status: 404, body: { error: "Order not found." } };
  const number = Number(seatNo);
  if (!Number.isInteger(number) || number < 1 || number > Number(order.quantity))
    return { status: 400, body: { error: "Invalid seat." } };
  const seat = await env.OBI_DB.prepare("SELECT * FROM bulk_seats WHERE order_id=? AND seat_no=?")
    .bind(orderId, number)
    .first();
  if (!seat) return { status: 404, body: { error: "Seat not found." } };
  if (seat.status === "claimed")
    return {
      status: 409,
      body: { error: "A claimed seat cannot be reassigned. Revoke it first." },
    };
  const label =
    typeof input.label === "string"
      ? input.label
          .replace(/[\u0000-\u001F\u007F]/g, "")
          .trim()
          .slice(0, 80)
      : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase().slice(0, 254) : "";
  if (email && !validEmail(email))
    return { status: 400, body: { error: "Enter a valid recipient email." } };
  const phone =
    typeof input.phone === "string" ? input.phone.replace(/[^\d+]/g, "").slice(0, 20) : "";
  if (phone && !/^\+?\d{7,20}$/.test(phone))
    return { status: 400, body: { error: "Enter a valid phone number." } };
  const now = new Date().toISOString();
  await env.OBI_DB.prepare(
    `UPDATE bulk_seats SET
      recipient_label=?, recipient_email=?, recipient_phone=?,
      status=CASE WHEN status='revoked' THEN 'available' ELSE status END,
      claimed_by_account=CASE WHEN status='revoked' THEN NULL ELSE claimed_by_account END,
      claim_reference=CASE WHEN status='revoked' THEN NULL ELSE claim_reference END,
      claimed_at=CASE WHEN status='revoked' THEN NULL ELSE claimed_at END,
      revoked_at=NULL
    WHERE order_id=? AND seat_no=?`,
  )
    .bind(label || null, email || null, phone || null, orderId, number)
    .run();
  await env.OBI_DB.prepare(
    "INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      "boe_" + randomHex(12),
      orderId,
      "seat_assigned",
      actor || null,
      JSON.stringify({ seat_no: number, email, phone }),
      now,
    )
    .run();
  const updated = await env.OBI_DB.prepare(
    "SELECT * FROM bulk_seats WHERE order_id=? AND seat_no=?",
  )
    .bind(orderId, number)
    .first();
  return { status: 200, body: { seat: publicSeat(updated, "") } };
}

export async function revokeBulkSeat(env, orderId, seatNo, actor = "") {
  await ensureBulkOrders(env);
  const seat = await env.OBI_DB.prepare("SELECT * FROM bulk_seats WHERE order_id=? AND seat_no=?")
    .bind(orderId, Number(seatNo))
    .first();
  if (!seat) return { status: 404, body: { error: "Seat not found." } };
  if (seat.status === "revoked")
    return { status: 200, body: { seat: publicSeat(seat, ""), alreadyRevoked: true } };
  const now = new Date().toISOString();
  const statements = [
    env.OBI_DB.prepare("UPDATE bulk_seats SET status='revoked', revoked_at=? WHERE id=?").bind(
      now,
      seat.id,
    ),
    env.OBI_DB.prepare(
      "INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(
      "boe_" + randomHex(12),
      orderId,
      "seat_revoked",
      actor || null,
      JSON.stringify({ seat_no: Number(seatNo) }),
      now,
    ),
  ];
  if (seat.claim_reference) {
    statements.unshift(
      env.OBI_DB.prepare("UPDATE purchases SET status='revoked' WHERE checkout_session_id=?").bind(
        seat.claim_reference,
      ),
    );
  }
  await env.OBI_DB.batch(statements);
  const updated = await env.OBI_DB.prepare("SELECT * FROM bulk_seats WHERE id=?")
    .bind(seat.id)
    .first();
  return { status: 200, body: { seat: publicSeat(updated, "") } };
}

export async function claimBulkSeat(env, account, tokenInput, deviceHash) {
  const token = typeof tokenInput === "string" ? tokenInput.trim() : "";
  if (!/^seat_[a-f0-9]{48}$/.test(token))
    return { status: 400, body: { error: "Enter a valid seat link." } };
  await ensureBulkOrders(env);
  const seat = await env.OBI_DB.prepare(
    `SELECT s.id,s.order_id,s.seat_no,s.status,s.recipient_label,s.recipient_email,s.recipient_phone,
      s.claimed_by_account,s.claim_reference,o.status AS order_status,o.currency,o.claims_open,o.revoked_at
    FROM bulk_seats s JOIN bulk_orders o ON o.id=s.order_id WHERE s.token_hash=?`,
  )
    .bind(await hashCode(token))
    .first();
  if (!seat) return { status: 404, body: { error: "That seat link was not found." } };
  if (seat.order_status !== "paid")
    return { status: 409, body: { error: "This order is not active yet." } };
  if (seat.revoked_at)
    return { status: 409, body: { error: "This bulk order has been revoked. Contact support." } };
  if (Number(seat.claims_open) === 0)
    return {
      status: 409,
      body: { error: "New claims are paused for this order. Contact the buyer." },
    };
  if (seat.status === "claimed") {
    if (seat.claimed_by_account === account.id)
      return { status: 200, body: { session_id: seat.claim_reference, alreadyClaimed: true } };
    return {
      status: 409,
      body: { error: "This seat has already been claimed on another account." },
    };
  }
  if (seat.status === "revoked")
    return { status: 409, body: { error: "This seat has been revoked by the purchaser." } };
  if (
    seat.recipient_email &&
    seat.recipient_email.toLowerCase() !== String(account.email || "").toLowerCase()
  ) {
    return {
      status: 403,
      body: { error: "This seat was assigned to a different email address." },
    };
  }
  const reference = "obi_" + randomHex(16);
  const now = new Date().toISOString();
  const readerName = seat.recipient_label || null;
  const expiresAt = accessExpiry(await getAccessDays(env), new Date(now));
  const editionNo = (await liveEdition(env))?.edition_no || 1;
  const results = await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "UPDATE bulk_seats SET status='claimed',claimed_by_account=?,claim_reference=?,claimed_at=? WHERE id=? AND status='available'",
    ).bind(account.id, reference, now, seat.id),
    env.OBI_DB.prepare(
      `INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,reader_name,amount_cents,currency,product_sku,status,granted_at,expires_at,edition_no)
      SELECT ?,?,?,?,0,?,?,'active',?,?,? FROM bulk_seats s JOIN bulk_orders o ON o.id=s.order_id
      WHERE s.id=? AND s.status='claimed' AND s.claim_reference=?`,
    ).bind(
      reference,
      "bulk-seat:" + seat.order_id,
      account.email,
      readerName,
      seat.currency,
      EDITION_SKU,
      now,
      expiresAt,
      editionNo,
      seat.id,
      reference,
    ),
    env.OBI_DB.prepare(
      `INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at)
      SELECT claim_reference,?,? FROM bulk_seats WHERE id=? AND status='claimed' AND claim_reference=?`,
    ).bind(deviceHash, now, seat.id, reference),
    env.OBI_DB.prepare(
      `INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at)
      SELECT ?,order_id,'seat_claimed',?,?,? FROM bulk_seats WHERE id=? AND status='claimed' AND claim_reference=?`,
    ).bind(
      "boe_" + randomHex(12),
      account.email,
      JSON.stringify({ seat_no: seat.seat_no }),
      now,
      seat.id,
      reference,
    ),
  ]);
  if (Number(results[1]?.meta?.changes || 0) > 0) {
    return { status: 200, body: { session_id: reference, claimed: true } };
  }
  const retry = await env.OBI_DB.prepare(
    "SELECT claim_reference FROM bulk_seats WHERE id=? AND claimed_by_account=?",
  )
    .bind(seat.id, account.id)
    .first();
  return retry?.claim_reference
    ? { status: 200, body: { session_id: retry.claim_reference, alreadyClaimed: true } }
    : { status: 409, body: { error: "This seat is no longer available." } };
}

function deviceLabel(metadataJson) {
  try {
    const meta = JSON.parse(metadataJson || "{}");
    return (
      [meta.platform, meta.mobile ? "mobile" : "desktop", meta.country]
        .filter(Boolean)
        .join(" · ") || "Recorded device"
    );
  } catch {
    return "Recorded device";
  }
}

export async function bulkOrderClaims(env, orderId) {
  if (!/^bprod_[a-f0-9]{32}$/.test(orderId || ""))
    return { status: 400, body: { error: "Invalid order." } };
  await ensureBulkOrders(env);
  const order = await env.OBI_DB.prepare(
    `SELECT id,buyer_email,receipt_email,quantity,currency,total_minor,provider,status,
    claims_open,paused_at,revoked_at,created_at,paid_at
    FROM bulk_orders WHERE id=?`,
  )
    .bind(orderId)
    .first();
  if (!order) return { status: 404, body: { error: "Order not found." } };
  const result = await env.OBI_DB.prepare(
    `SELECT c.account_id,c.checkout_session_id,c.claimed_at,
    a.email,a.phone,d.device_hash,d.metadata_json,p.status AS purchase_status
    FROM bulk_order_claims c
    LEFT JOIN obi_accounts a ON a.id=c.account_id
    LEFT JOIN reader_devices d ON d.checkout_session_id=c.checkout_session_id
    LEFT JOIN purchases p ON p.checkout_session_id=c.checkout_session_id
    WHERE c.order_id=? ORDER BY c.claimed_at DESC`,
  )
    .bind(order.id)
    .all();
  const claims = (result.results || []).map((row) => {
    let ipHash = "";
    try {
      ipHash = String(JSON.parse(row.metadata_json || "{}").ipHash || "");
    } catch {
      /* metadata is optional */
    }
    return { ...row, ipHash, device: deviceLabel(row.metadata_json) };
  });
  const deviceCounts = new Map();
  const ipCounts = new Map();
  for (const claim of claims) {
    if (claim.device_hash)
      deviceCounts.set(claim.device_hash, (deviceCounts.get(claim.device_hash) || 0) + 1);
    if (claim.ipHash) ipCounts.set(claim.ipHash, (ipCounts.get(claim.ipHash) || 0) + 1);
  }
  const alerts = [];
  for (const count of deviceCounts.values())
    if (count > 1) alerts.push(`${count} claims from the same device`);
  for (const count of ipCounts.values())
    if (count > 1) alerts.push(`${count} claims from the same network`);
  const seats = await env.OBI_DB.prepare(
    "SELECT count(*) AS total, SUM(CASE WHEN status='claimed' THEN 1 ELSE 0 END) AS claimed FROM bulk_seats WHERE order_id=?",
  )
    .bind(order.id)
    .first();
  const claimed = Number(seats?.total || 0) > 0 ? Number(seats.claimed || 0) : claims.length;
  return {
    status: 200,
    body: {
      order: {
        ...order,
        claims_open: Number(order.claims_open ?? 1),
        claimed,
        remaining: Math.max(0, Number(order.quantity) - claimed),
      },
      claims: claims.map((claim) => ({
        account_id: claim.account_id,
        reference: claim.checkout_session_id,
        email: claim.email || "",
        phone: claim.phone || "",
        device: claim.device,
        device_claims: claim.device_hash ? deviceCounts.get(claim.device_hash) || 1 : 0,
        ip_claims: claim.ipHash ? ipCounts.get(claim.ipHash) || 1 : 0,
        claimed_at: claim.claimed_at,
        status: claim.purchase_status || "unknown",
      })),
      alerts: [...new Set(alerts)],
    },
  };
}

export async function setBulkOrderClaimsState(env, orderId, action, actor = "") {
  if (!/^bprod_[a-f0-9]{32}$/.test(orderId || ""))
    return { status: 400, body: { error: "Invalid order." } };
  if (!["pause", "resume", "revoke"].includes(action))
    return { status: 400, body: { error: "Choose pause, resume or revoke." } };
  await ensureBulkOrders(env);
  const order = await env.OBI_DB.prepare(
    "SELECT id,status,claims_open,paused_at,revoked_at FROM bulk_orders WHERE id=?",
  )
    .bind(orderId)
    .first();
  if (!order) return { status: 404, body: { error: "Order not found." } };
  if (order.revoked_at) {
    return action === "revoke"
      ? {
          status: 200,
          body: {
            order_id: order.id,
            action,
            claims_open: 0,
            paused_at: order.paused_at,
            revoked_at: order.revoked_at,
          },
        }
      : { status: 409, body: { error: "This code has been revoked and cannot be resumed." } };
  }
  const now = new Date().toISOString();
  if (action === "pause") {
    await env.OBI_DB.batch([
      env.OBI_DB.prepare(
        "UPDATE bulk_orders SET claims_open=0, paused_at=?, updated_at=? WHERE id=?",
      ).bind(now, now, order.id),
      env.OBI_DB.prepare(
        "INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)",
      ).bind(
        "boe_" + randomHex(12),
        order.id,
        "claims_paused",
        actor || null,
        JSON.stringify({ previous_claims_open: Number(order.claims_open ?? 1) }),
        now,
      ),
    ]);
    return {
      status: 200,
      body: { order_id: order.id, action, claims_open: 0, paused_at: now, revoked_at: null },
    };
  }
  if (action === "resume") {
    await env.OBI_DB.batch([
      env.OBI_DB.prepare(
        "UPDATE bulk_orders SET claims_open=1, paused_at=NULL, updated_at=? WHERE id=?",
      ).bind(now, order.id),
      env.OBI_DB.prepare(
        "INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)",
      ).bind(
        "boe_" + randomHex(12),
        order.id,
        "claims_resumed",
        actor || null,
        JSON.stringify({}),
        now,
      ),
    ]);
    return {
      status: 200,
      body: { order_id: order.id, action, claims_open: 1, paused_at: null, revoked_at: null },
    };
  }
  await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "UPDATE bulk_orders SET claims_open=0, paused_at=NULL, revoked_at=?, updated_at=? WHERE id=?",
    ).bind(now, now, order.id),
    env.OBI_DB.prepare(
      "UPDATE purchases SET status='revoked' WHERE checkout_session_id IN (SELECT checkout_session_id FROM bulk_order_claims WHERE order_id=?)",
    ).bind(order.id),
    env.OBI_DB.prepare(
      "UPDATE purchases SET status='revoked' WHERE checkout_session_id IN (SELECT claim_reference FROM bulk_seats WHERE order_id=? AND claim_reference IS NOT NULL)",
    ).bind(order.id),
    env.OBI_DB.prepare(
      "INSERT INTO bulk_order_events (id,order_id,event_type,actor,details,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(
      "boe_" + randomHex(12),
      order.id,
      "claims_revoked",
      actor || null,
      JSON.stringify({}),
      now,
    ),
  ]);
  return {
    status: 200,
    body: { order_id: order.id, action, claims_open: 0, paused_at: null, revoked_at: now },
  };
}
