// Shared request validation for the existing Worker API.
// Keep accepted formats compatible with currently deployed web and mobile clients.
export function validSessionId(sessionId) {
  if (typeof sessionId !== "string") return false;
  // Stripe: cs_…   Paystack: our own obi_… reference.
  return /^(cs_[A-Za-z0-9_]{12,255}|obi_[a-z0-9]{16,64})$/.test(sessionId);
}

export function validDeviceToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{24,256}$/.test(token);
}
