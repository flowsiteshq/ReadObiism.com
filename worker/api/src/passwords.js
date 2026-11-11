// Shared password hashing helpers. Keep the PBKDF2 format compatible with
// existing obi_accounts.password_hash/password_salt records.
const encoder = new TextEncoder();

// Cloudflare Workers rejects PBKDF2 iteration counts above 100000:
// "NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported".
const PBKDF2_ITERATIONS = 100000;

export function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64ToBytes(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export function passwordSalt() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function createPassword(password) {
  const salt = passwordSalt();
  return { salt, hash: await passwordDigest(password, salt) };
}

// Readable but hard to guess. Ambiguous characters are intentionally omitted
// because support may need to read a temporary password aloud.
export function generatePassword(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const size = Math.max(12, Math.min(64, Number(length) || 18));
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
