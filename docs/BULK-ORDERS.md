# Bulk orders and shared activation codes

## Agreed workflow

One buyer purchases a quantity of editions. After payment is verified, the order receives **one unique shareable code**. Different recipients use that code to activate their own edition. A 20-copy order permits 20 successful activations in total; once exhausted, the code cannot grant another edition. Existing gift purchases remain a separate one-recipient flow.

## Local prototype available

Open `http://127.0.0.1:5514/admin/#bulk`. The admin can create a **simulated** order without payment, or choose Paystack (NGN) or Stripe (USD) for a **test-mode** checkout. Choose standard pricing or an approved whole-percentage discount (1–99%). For a discount, the administrator records an approval note and confirms it; the administrator's identity and note are retained with the order. This is an administrator's attestation, not an independent approval workflow. The Worker calculates the unit price in minor currency units, rounds it to the nearest unit, and multiplies by the quantity. It records the gateway, currency and amount for each order. Existing Paystack test orders remain readable. Arbitrary custom prices, conversion and additional gateways are not yet supported.

After returning, the admin uses **Check payment**. The Worker verifies the payment directly with the selected provider, including its test mode, successful status, currency, amount, buyer email and order details, before making the test code available. An authenticated administrator can recover a paid test code from the payment list. The local code derivation secret is in ignored `.dev.vars`; changing or losing it prevents recovery of existing paid test codes. Configure the relevant test key in admin Payment settings and restart the Worker before checkout.

Copy the code to `http://127.0.0.1:5514/bulk-redeem.html`. Each recipient must sign in or register a reader account. The same account can retry without consuming another copy; a new account consumes one copy, until the quantity is exhausted. D1 applies the capacity check, claim, test entitlement and device binding as one batch. Use separate browser profiles on this computer to simulate different readers. Loopback URLs do not work for recipients on other machines.

The prototype is restricted to loopback requests with `OBI_BULK_LOCAL_TEST=1`; it cannot take a live key or make a real payment. Records are marked as local tests, including the zero-value reader entitlements. It does **not** establish that different accounts belong to different people: registration email verification is not implemented. The existing one-browser/device restriction remains in effect.

Tests cover idempotent retries, concurrent capacity, transactional rollback, unauthenticated access, provider amount verification and reading a claimed local test edition. Successful hosted test payments require a manual browser pass. The production flow is not complete.

## Work required before this is operational

- Add production bulk checkout for the buyer's chosen Stripe (USD) or Paystack (NGN) gateway. The Worker must set and verify the quantity, unit price, currency, amount, order reference and product server-side. A redirect or unverified callback must never issue a code.
- Create an order and high-entropy code only after the correct verified payment or signed, idempotently processed webhook. Ensure retries return the same order and cannot issue duplicate codes. Store a secure code hash for lookup and provide an appropriately protected delivery/recovery process; do not put codes in URLs, logs or public analytics.
- Require a recipient to authenticate before claiming; add verified ownership of their identity before depending on it for recovery. A claim must attach one entitlement to that recipient, integrate with the existing reader and device rules, and be idempotent for repeat requests by the same recipient.
- Use a D1 atomic transaction or equivalent database-enforced mechanism for checking available capacity, inserting a unique recipient claim and granting the entitlement. Concurrent claims for the last copy must never exceed the purchased quantity; a failed grant must not consume a copy. A device transfer must not consume a second copy.
- Define expired, refunded, cancelled, disputed and partially refunded orders, including how previously activated copies and unused capacity are reconciled. Record administrator actions and payment events in an audit trail and enforce server-side roles.
- Provide a buyer confirmation and code-sharing path, a recipient activation screen, and a read-only dashboard showing purchaser, quantity, claimed and remaining copies, status and payment reference. Mask codes in routine lists. Avoid showing real customer records in local fixtures or unprotected previews.
- Test zero and full capacity, 20 unique claims, repeated recipient retries, simultaneous final claims, partial failure/rollback, forged and duplicate payment events, refunds, account/device recovery and both payment providers in isolated test environments.

The existing single-edition checkout validates an amount for one copy, and the existing gift code is restricted to one named recipient. The local prototype is separate from both. Production deployment, payment webhooks, refunds, buyer access and the remaining production protections above are not implemented.
