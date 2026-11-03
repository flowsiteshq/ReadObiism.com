# Bulk orders and shared activation codes

## Production flow (enabled for Paystack)

1. The buyer opens `/bulk.html` and signs in. A reader account is required.
2. The buyer chooses the quantity (1–10,000) and a provider:
   - **Paystack (NGN)** — enabled in production.
   - **Stripe (USD)** — code path exists, but the production Stripe secrets are not configured, so USD checkout returns `503` until they are set.
3. The Worker creates a `bprod_...` order, stores the unit amount and total in minor units, and initializes the provider checkout.
4. After payment, the buyer returns to `bulk-confirmation.html?order=...`. `POST /api/bulk/verify` verifies the payment directly with the provider and issues one `OBI-BULK-...` code.
5. The buyer must have a verified account email before the code is released.
6. The buyer shares the code. Recipients open `/bulk-redeem.html`, sign in or create an account with an email **or a phone number and password**, enter the code, and claim one edition. Each claim creates an active purchase and device binding for that recipient.
7. The same recipient can retry without consuming another copy. Claims are capped at the purchased quantity.
8. Individual per-seat links are optional behind `OBI_BULK_INDIVIDUAL_SEATS=1`. The default is the shared code exactly as described above. When enabled, one link per copy is generated up to 500 copies, and the shared code is disabled for that order.

## Payment handling

- **Paystack:** `/api/paystack/webhook` accepts `charge.success` events for `bpo_` references, looks up the order, verifies the transaction with Paystack, and marks the order paid. The buyer-return endpoint `/api/bulk/verify` is the fallback when the webhook is delayed. For a single-edition Paystack purchase, `/api/reader/claim` also verifies the `obi_...` reference on demand, so a delayed webhook does not block book access.
- **Stripe:** `checkout.session.completed` sessions with `metadata.bulk_order=1` are routed to the same verification function. This remains inactive until `OBI_STRIPE_SECRET_KEY` and `OBI_STRIPE_WEBHOOK_SECRET` are configured.

## Security controls

- Signed-in buyer only; the account email must be verified before the code is shown.
- Provider amount, currency, reference, metadata and buyer email are verified server-side.
- High-entropy codes: `OBI-BULK-` followed by 48 hex characters.
- Rate limits: 30 requests/hour per IP and 15/hour per account for bulk routes.
- Admin/local test flow stays separate under `/api/admin/bulk-local` and is loopback-only.

## Current limitations

- Stripe production keys are not set, so USD checkout is unavailable.
- The admin dashboard's **Bulk orders** section still shows the local-test workspace. Production orders are available through `GET /api/admin/bulk-orders` but are not yet rendered in the dashboard.
- Refund, dispute and partial-refund states exist in the schema but are not automated.
- The buyer receives the code on the confirmation page. Email delivery of the shared code is not implemented.
- Discounts are rejected at checkout until an administrator approval workflow is wired into the production buyer flow.

## Verification

Run the Worker tests from `worker/`:

```powershell
npm test
```

The bulk recovery tests cover idempotent verification, concurrent claims, capacity limits, rollback, provider amount checks, currency retention and wrong-key recovery.
