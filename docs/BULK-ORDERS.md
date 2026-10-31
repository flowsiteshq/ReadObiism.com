# Bulk orders and shared activation codes

## Agreed workflow

One buyer purchases a quantity of editions. After payment is verified, the order receives **one unique shareable code**. Different recipients use that code to activate their own edition. A 20-copy order permits 20 successful activations in total; once exhausted, the code cannot grant another edition. Existing gift purchases remain a separate one-recipient flow.

## Work required before this is operational

- Add a bulk checkout flow for the buyer's chosen Stripe (USD) or Paystack (NGN) gateway. The Worker must set and verify the quantity, unit price, currency, amount, order reference and product server-side. A redirect or unverified callback must never issue a code.
- Create an order and high-entropy code only after the correct verified payment or signed, idempotently processed webhook. Ensure retries return the same order and cannot issue duplicate codes. Store a secure code hash for lookup and provide an appropriately protected delivery/recovery process; do not put codes in URLs, logs or public analytics.
- Require a recipient to authenticate before claiming; add verified ownership of their identity before depending on it for recovery. A claim must attach one entitlement to that recipient, integrate with the existing reader and device rules, and be idempotent for repeat requests by the same recipient.
- Use a D1 atomic transaction or equivalent database-enforced mechanism for checking available capacity, inserting a unique recipient claim and granting the entitlement. Concurrent claims for the last copy must never exceed the purchased quantity; a failed grant must not consume a copy. A device transfer must not consume a second copy.
- Define expired, refunded, cancelled, disputed and partially refunded orders, including how previously activated copies and unused capacity are reconciled. Record administrator actions and payment events in an audit trail and enforce server-side roles.
- Provide a buyer confirmation and code-sharing path, a recipient activation screen, and a read-only dashboard showing purchaser, quantity, claimed and remaining copies, status and payment reference. Mask codes in routine lists. Avoid showing real customer records in local fixtures or unprotected previews.
- Test zero and full capacity, 20 unique claims, repeated recipient retries, simultaneous final claims, partial failure/rollback, forged and duplicate payment events, refunds, account/device recovery and both payment providers in isolated test environments.

The current single-edition checkout validates an amount for one copy, and the existing gift code is restricted to one named recipient. Neither implements the workflow above. The admin bulk page is therefore intentionally marked as in development; it must not claim that code creation or bulk payment works yet.
