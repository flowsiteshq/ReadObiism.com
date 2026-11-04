# Bulk orders and shared activation codes

## Production flow (enabled for Paystack)

1. The buyer opens `/bulk.html` and signs in. A reader account is required.
2. The buyer chooses the quantity (1–10,000) and a provider:
   - **Paystack (NGN)** — enabled in production.
   - **Stripe (USD)** — code path exists, but the production Stripe secrets are not configured, so USD checkout returns `503` until they are set.
3. The Worker creates a `bprod_...` order, stores the unit amount and total in minor units, and initializes the provider checkout.
4. After payment, the buyer returns to `bulk-confirmation.html?order=...`. `POST /api/bulk/verify` verifies the payment directly with the provider and issues one `OBI-BULK-...` code.
5. The buyer must enter a real email address for the payment receipt and order contact. That receipt email is separate from the signed-in account identity; a phone login remains valid. The code is released to the signed-in buyer.
6. The buyer shares the code. Recipients open `/bulk-redeem.html`, sign in or create an account with an email **or a phone number and password**, enter the code, and claim one edition. Each claim creates an active purchase and device binding for that recipient.
7. The same recipient can retry without consuming another copy. Claims are capped at the purchased quantity.
8. Individual per-seat links are optional behind `OBI_BULK_INDIVIDUAL_SEATS=1`. The default is the shared code exactly as described above. When enabled, one link per copy is generated up to 500 copies, and the shared code is disabled for that order.

## Payment handling

- **Paystack:** `/api/paystack/webhook` accepts `charge.success` events for `bpo_` references, looks up the order, verifies the transaction with Paystack, and marks the order paid. The buyer-return endpoint `/api/bulk/verify` is the fallback when the webhook is delayed. For a single-edition Paystack purchase, `/api/reader/claim` also verifies the `obi_...` reference on demand, so a delayed webhook does not block book access.
- **Stripe:** `checkout.session.completed` sessions with `metadata.bulk_order=1` are routed to the same verification function. This remains inactive until `OBI_STRIPE_SECRET_KEY` and `OBI_STRIPE_WEBHOOK_SECRET` are configured.

## Security controls

- Signed-in buyer only. Order ownership is tied to the buyer's account ID, not the receipt email.
- Provider amount, currency, reference, metadata and receipt email are verified server-side.
- High-entropy codes: `OBI-BULK-` followed by 48 hex characters. Codes are stored hashed for lookup and encrypted for recovery; full codes are never shown to admins.
- One claim per account per order and one device per claimed copy.
- Rate limits: 30 requests/hour per IP and 15/hour per account for bulk routes.
- Admin/local test flow stays separate under `/api/admin/bulk-local` and is loopback-only.
- Admin can review claims, pause new claims, resume claims, or revoke a code. Pausing blocks new claims but keeps existing readers active; revoking marks existing purchase records revoked.
- Bulk claim risk indicators flag repeated claims from the same device or hashed network.
- The buyer receives a receipt email with an authenticated order link; the raw code stays on the protected order page.

## Admin access controls

- `GET /api/admin/bulk-orders` lists production orders with receipt email, copy count, claim count and paused/revoked status.
- `GET /api/admin/bulk-order?order_id=bprod_...` returns the order and its claims, device labels and risk indicators.
- `POST /api/admin/bulk-order/action` with `{ order_id, action }` supports `pause`, `resume` and `revoke`. It requires an admin session, same-origin request and JSON content type.
- All changes are written to `bulk_order_events` with the admin email as actor.

## Leak response

1. Open **Bulk orders** in the admin area and select **Claims** for the affected order.
2. Identify the claim or pattern from the claim list and risk indicators.
3. Use **Pause new claims** to stop new recipients immediately while keeping existing readers active.
4. Use **Revoke code** if the order must be shut down entirely; existing readers will lose access.
5. Contact the buyer using the receipt email on the order.
6. Do not share full codes in admin screens or support messages.

## Support runbook

### Buyer lost the order link

1. Ask for the order ID or receipt email.
2. The buyer signs in with the account that placed the order.
3. Open `/bulk-confirmation?order=<order_id>`.
4. If the buyer cannot sign in, follow account recovery; do not send the full code by email.

### Recipient lost or changed device

- The copy is bound to one device at a time.
- Use the normal device-transfer flow when the account can receive the email code.
- Phone-only accounts cannot currently receive the transfer code; escalate for support-assisted review.
- Do not disable device binding or move a copy manually without verifying ownership.

### Recipient has no email

- They can create a phone account and claim with the shared code.
- The buyer still needs a real receipt email at checkout.
- Phone accounts are password-based; there is no OTP reset yet. Escalate password recovery to support.

### Buyer has no email

- Current policy: a buyer must enter a real email at checkout because Paystack/Stripe require one.
- The email is for the receipt and order contact only; the buyer can keep using a phone login.
- Do not use the internal `@phone.obiism.local` address as a receipt email.

### Refund or chargeback

1. Check the order status and claim count first.
2. Pause new claims if the dispute is active.
3. Revoke the code only after the refund/chargeback decision is confirmed.
4. Record the decision in the order event history and follow the published Refund Policy.

### Google-only account cannot transfer

- Google accounts have no password known to the reader.
- Escalate to support; do not reset or merge accounts without ownership verification.

## Current limitations

- Stripe production keys are not set, so USD checkout is unavailable.
- Production bulk orders and claim controls are rendered in the admin workspace; the local test tools remain separate.
- Refund, dispute and partial-refund states exist in the schema but are not automated.
- The buyer receives a receipt email with an authenticated order link. The raw shared code is shown only on the protected order page, not in the email.
- Individual claim revocation is not implemented. Use **Pause new claims** to stop new recipients, or **Revoke code** to stop the whole order.
- Phone accounts remain password-based; OTP and phone-based password reset are not implemented.
- Discounts are rejected at checkout until an administrator approval workflow is wired into the production buyer flow.

## Verification

Run the Worker tests from `worker/`:

```powershell
npm test
```

The bulk tests cover idempotent verification, concurrent claims, capacity limits, rollback, provider amount checks, currency retention, wrong-key recovery, pausing new claims while preserving existing readers, and revoking a code across existing purchases.
