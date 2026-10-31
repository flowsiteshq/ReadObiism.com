# Device-transfer implementation and rollout

This is local work, not a production deployment.

## What is implemented

- The web reader offers a transfer when the current browser conflicts with an active binding.
- Transfer requires a signed-in account, an active purchase whose owner matches the account email (or a redeemed gift recipient), and a fresh eight-digit code delivered to that email. Codes expire after ten minutes, allow five attempts, are bound to the requesting browser token and account, and can be used only once. Requests are limited to five per account per hour.
- A successful transfer replaces the existing binding conditionally and records a transfer audit entry. A subsequent server request from the old token is rejected; content already displayed or cached in a browser's memory cannot be remotely erased.
- New Paystack fulfillments verify the reference, price, currency, product metadata and checkout device hash, and create the device binding with the purchase. Redeemed gifts remain unbound until redemption. Stripe's existing checkout-device binding is retained.
- Updated browser and Expo readers send the device token in the `x-obi-device-token` header. The Worker temporarily accepts the old query-string parameter for deployed clients that have not yet upgraded. This compatibility fallback means old clients may still expose their token in request logs until they are upgraded and the fallback is removed.

## Required before enabling

1. Configure `RESEND_API_KEY` and a verified `ACCOUNT_FROM_EMAIL` (or the existing `GIFT_FROM_EMAIL`) in the intended environment. No code is sent or access moved when email configuration is absent or delivery fails. Do not put secrets in Git.
2. Test in an isolated environment with a real mailbox, the same payment and account email, and two browser profiles. Confirm correct, wrong, expired and reused codes, already-revoked purchase, first-device behavior for both gateways, and device replacement on browser data loss. The automated tests use a simulated email provider, not a real inbox.
3. Deploy a compatible Worker before deploying the updated web reader or Expo app. Existing live code may not recognize the header or Paystack references. Test database schema creation and rollback on an isolated D1 copy first. No production migration or deployment has been performed.
4. Ensure Paystack webhook delivery and retry/reconciliation are configured. New payments lacking the expected SKU and device-hash metadata will not be granted automatically; verify older pending payment behavior before deployment.

## Remaining work

- This implementation verifies email ownership **for each transfer**. It does not yet add account-registration email verification or change the existing login/account-access association by unverified email. Do not represent account ownership as verified or rely on it alone for other privileged actions.
- An administrator dashboard, role management, verified support procedure, transfer policy (for example an annual transfer limit), account recovery, and notifications of completed transfers are not implemented. The audit table is only a foundation for that work.
- Mobile has header support but has no transfer UI. Gift recipients still need a tested sign-in/account-recovery path linked to their redeemed entitlement.
- Stronger protection for production: review concurrent rate limiting, email-provider failure and abuse handling, account-creation squatting, session lifecycle, and a backup/rollback plan before release.
