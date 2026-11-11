// Password reset challenges are deliberately separate from email-verification
// challenges: a reset code proves mailbox control and can revoke sessions.
import { hashDeviceToken } from "./security.js";
import { passwordResetEmail } from "./email-templates.js";

const publicOrigin = (env) =>
  env.OBI_PUBLIC_APP_URL === "https://readobiism.com"
    ? env.OBI_PUBLIC_APP_URL
    : "https://readobiism.com";

const schema = `
CREATE TABLE IF NOT EXISTS account_password_resets (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, code_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT);
CREATE INDEX IF NOT EXISTS account_password_resets_account_idx ON account_password_resets(account_id, created_at);`;

export async function ensurePasswordResetSchema(env) {
  if (!env.OBI_DB) throw new Error("OBI_DB binding unavailable");
  await env.OBI_DB.exec(schema);
}

const randomId = () =>
  "reset_" +
  Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

export function isRecoveryEmail(email) {
  return typeof email === "string" && /^\S+@\S+\.\S+$/.test(email) && !/@phone\.obiism\.local$/i.test(email);
}

export async function sendPasswordReset(env, account, { localTest = false } = {}) {
  await ensurePasswordResetSchema(env);
  if (!account || !isRecoveryEmail(account.email)) {
    return {
      status: 400,
      body: { error: "This account does not have a recovery email. Ask an administrator for help." },
    };
  }

  const from = env.ACCOUNT_FROM_EMAIL || env.GIFT_FROM_EMAIL;
  const emailConfigured = env.RESEND_API_KEY?.startsWith("re_") && Boolean(from);
  if (!emailConfigured && !localTest) {
    return {
      status: 503,
      body: {
        error: "Password recovery is not available right now. Please contact support.",
      },
    };
  }

  const recent = await env.OBI_DB.prepare(
    "SELECT count(*) AS count FROM account_password_resets WHERE account_id=? AND created_at>?",
  )
    .bind(account.id, new Date(Date.now() - 3600000).toISOString())
    .first();
  if (Number(recent?.count || 0) >= 5) {
    return {
      status: 429,
      body: { error: "Too many password reset requests. Please try again later." },
    };
  }

  const id = randomId();
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const code = String(bytes[0] % 100000000).padStart(8, "0");
  const now = new Date();
  const expired = now.toISOString();
  await env.OBI_DB.batch([
    env.OBI_DB.prepare(
      "UPDATE account_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL",
    ).bind(expired, account.id),
    env.OBI_DB.prepare(
      "INSERT INTO account_password_resets (id,account_id,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)",
    ).bind(
      id,
      account.id,
      await hashDeviceToken(`${id}:${code}`),
      now.toISOString(),
      new Date(now.getTime() + 600000).toISOString(),
    ),
  ]);

  if (!emailConfigured) {
    return { status: 200, body: { message: "Local test code", testCode: code }, localTest: true };
  }

  const message = passwordResetEmail({
    code,
    link: `${publicOrigin(env)}/forgot-password?email=${encodeURIComponent(account.email)}`,
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
        tags: [{ name: "type", value: "password-reset" }],
      }),
    });
    if (!sent.ok) {
      const detail = await sent.text().catch(() => "");
      throw new Error(`Email provider rejected request (${sent.status}): ${detail.slice(0, 300)}`);
    }
  } catch (error) {
    console.error("Password reset email delivery failed", error);
    await env.OBI_DB.prepare(
      "UPDATE account_password_resets SET consumed_at=? WHERE id=?",
    )
      .bind(new Date().toISOString(), id)
      .run();
    return {
      status: 503,
      body: { error: "Could not send the reset code. Please try again." },
    };
  }

  return { status: 200, body: { message: "Password reset code sent." }, sent: true };
}
