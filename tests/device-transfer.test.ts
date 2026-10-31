import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import worker, { hashDeviceToken } from "../dashboard-worker.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const sessionId = `obi_${"a".repeat(24)}`;
const oldToken = "a".repeat(32);
const newToken = "b".repeat(32);

function database() {
  const db = new DatabaseSync(":memory:");
  const wrap = (sql: string) => {
    const statement = db.prepare(sql);
    return { bind: (...args: any[]) => ({
      first: async () => statement.get(...args) ?? null,
      all: async () => ({ results: statement.all(...args) }),
      run: async () => ({ meta: { changes: Number(statement.run(...args).changes) } }),
    }) };
  };
  return { db, binding: { exec: async (sql: string) => db.exec(sql), prepare: wrap, batch: async (statements: any[]) => Promise.all(statements.map((s) => s.run())) } };
}

async function setup() {
  const { db, binding } = database();
  const env = { OBI_DB: binding, RESEND_API_KEY: "re_test", ACCOUNT_FROM_EMAIL: "reader@example.com" };
  const register = await worker.fetch(new Request("https://readobiism.com/api/account/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "reader@example.com", password: "test-password" }) }), env);
  expect(register.status).toBe(200);
  const { token } = await register.json();
  const oldHash = await hashDeviceToken(oldToken);
  db.prepare("INSERT INTO purchases VALUES (?,?,?,?,?,?,?,?)").run(sessionId, "test", "reader@example.com", 699500, "NGN", "obi_ism_complete_edition", "active", new Date().toISOString());
  db.prepare("INSERT INTO reader_devices VALUES (?,?,?)").run(sessionId, oldHash, new Date().toISOString());
  const send = (path: string, body: unknown, bearer = token) => worker.fetch(new Request(`https://readobiism.com${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bearer}`, origin: "https://readobiism.com" }, body: JSON.stringify(body) }), env);
  return { db, env, token, send };
}

afterEach(() => vi.unstubAllGlobals());

describe("device transfer", () => {
  it("requires email proof, transfers once, and invalidates the previous device", async () => {
    let deliveredCode = "";
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      deliveredCode = JSON.parse(options.body).text.match(/\b\d{8}\b/)[0];
      return new Response("{}", { status: 200 });
    }));
    const { db, env, send } = await setup();
    const start = await send("/api/reader/transfer/start", { session_id: sessionId, device_token: newToken });
    expect(start.status).toBe(200);
    const { challengeId } = await start.json();
    const wrong = await send("/api/reader/transfer/confirm", { challenge_id: challengeId, code: deliveredCode === "00000000" ? "00000001" : "00000000", device_token: newToken });
    expect(wrong.status).toBe(400);
    const confirmed = await send("/api/reader/transfer/confirm", { challenge_id: challengeId, code: deliveredCode, device_token: newToken });
    expect(confirmed.status).toBe(200);
    expect((db.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").get(sessionId) as any).device_hash).toBe(await hashDeviceToken(newToken));
    expect((db.prepare("SELECT count(*) AS count FROM device_transfer_audit").get() as any).count).toBe(1);
    const replay = await send("/api/reader/transfer/confirm", { challenge_id: challengeId, code: deliveredCode, device_token: newToken });
    expect(replay.status).toBe(400);
    const oldReader = await worker.fetch(new Request(`https://readobiism.com/api/reader?session_id=${sessionId}`, { headers: { "x-obi-device-token": oldToken } }), env);
    expect(oldReader.status).toBe(403);
    db.close();
  });

  it("rejects unauthenticated requests and does not transfer without email configuration", async () => {
    const { db, env, send } = await setup();
    const unauthenticated = await send("/api/reader/transfer/start", { session_id: sessionId, device_token: newToken }, "invalid");
    expect(unauthenticated.status).toBe(401);
    env.RESEND_API_KEY = "";
    const unavailable = await send("/api/reader/transfer/start", { session_id: sessionId, device_token: newToken });
    expect(unavailable.status).toBe(503);
    expect((db.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").get(sessionId) as any).device_hash).toBe(await hashDeviceToken(oldToken));
    db.close();
  });

  it("rejects expired codes and transfers for a revoked edition", async () => {
    let deliveredCode = "";
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      deliveredCode = JSON.parse(options.body).text.match(/\b\d{8}\b/)[0];
      return new Response("{}", { status: 200 });
    }));
    const { db, send } = await setup();
    const start = await send("/api/reader/transfer/start", { session_id: sessionId, device_token: newToken });
    const { challengeId } = await start.json();
    db.prepare("UPDATE device_transfer_challenges SET expires_at=? WHERE id=?").run("2000-01-01T00:00:00.000Z", challengeId);
    expect((await send("/api/reader/transfer/confirm", { challenge_id: challengeId, code: deliveredCode, device_token: newToken })).status).toBe(400);
    db.prepare("UPDATE purchases SET status='revoked' WHERE checkout_session_id=?").run(sessionId);
    expect((await send("/api/reader/transfer/start", { session_id: sessionId, device_token: newToken })).status).toBe(403);
    expect((db.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").get(sessionId) as any).device_hash).toBe(await hashDeviceToken(oldToken));
    db.close();
  });

  it("does not allow a different account to request a transfer", async () => {
    const { db, env, send } = await setup();
    const register = await worker.fetch(new Request("https://readobiism.com/api/account/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "other@example.com", password: "test-password" }) }), env);
    const { token } = await register.json();
    const response = await send("/api/reader/transfer/start", { session_id: sessionId, device_token: newToken }, token);
    expect(response.status).toBe(403);
    expect((db.prepare("SELECT count(*) AS count FROM device_transfer_challenges").get() as any).count).toBe(0);
    db.close();
  });
});

describe("Paystack device binding", () => {
  it("binds the verified checkout device before allowing a reader claim", async () => {
    const { db, env, send } = await setup();
    const reference = `obi_${"c".repeat(24)}`;
    const hash = await hashDeviceToken(oldToken);
    const paymentEnv = { ...env, PAYSTACK_SECRET_KEY: "sk_test_example" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: true, data: { status: "success", reference, currency: "NGN", amount: 699500, id: 123, customer: { email: "reader@example.com" }, metadata: { product_sku: "obi_ism_complete_edition", device_hash: hash } } }), { status: 200 })));
    const body = JSON.stringify({ event: "charge.success", data: { reference } });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(paymentEnv.PAYSTACK_SECRET_KEY), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
    const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((v) => v.toString(16).padStart(2, "0")).join("");
    const response = await worker.fetch(new Request("https://readobiism.com/api/paystack/webhook", { method: "POST", headers: { "x-paystack-signature": signature }, body }), paymentEnv);
    expect(response.status).toBe(200);
    expect((db.prepare("SELECT device_hash FROM reader_devices WHERE checkout_session_id=?").get(reference) as any).device_hash).toBe(hash);
    expect((await send("/api/reader/claim", { session_id: reference, device_token: newToken })).status).toBe(409);
    db.close();
  });
});
