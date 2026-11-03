# Device binding and transfer policy

## Current model

OBI-ISM is a **one-device, one-reader licence** per purchase.

- The buyer starts checkout in a browser. That browser creates a high-entropy device token in `localStorage` under `obi-ism.reader-device.<purchase reference>`.
- The Worker stores only a SHA-256 hash of that token in `reader_devices`. The raw token never leaves the browser.
- The first successful claim binds the purchase to that device hash.
- `/api/reader` and narration requests must present the same device token and an active purchase.
- A different browser or device gets `409` and is offered the transfer screen.

## Transfer requirements

Moving an edition to a new device requires all of the following:

1. A signed-in account that owns the purchase (buyer or redeemed gift recipient).
2. The **account password** re-entered on the transfer screen.
3. A fresh 8-digit code sent to the account email.
4. A valid new-device token.
5. No transfer in the previous **7 days**.
6. No more than **3 transfers in the previous 180 days**.

On success:

- `reader_devices.device_hash` is replaced with the new device hash.
- The old device immediately fails the device check.
- A row is written to `device_transfer_audit`, including the old/new hashes and audit metadata.
- The account email receives a “Your OBI-ISM edition was moved” notice.

## What is recorded (and what is not)

Recorded for audit and support:

- hashed IP address (`ipHash`) — never the raw IP
- Cloudflare country, city and region
- ASN
- platform (Windows, macOS, Android, iOS, …)
- mobile/desktop hint
- browser user agent (truncated)
- transfer old/new device hashes and timestamp

Not used as a hard access key:

- IP address
- country
- browser fingerprint
- screen size, fonts or canvas fingerprint

IP and geography are **risk signals only**. Mobile networks, CGNAT, VPNs and travel change IPs legitimately. Hard IP locking would create false lockouts and is not reliable privacy protection.

## Reader watermark

The reader response includes a `license` object. The reader renders a small fixed watermark:

```text
LICENSED TO reader@example.com · 1A2B3C4D · Windows · desktop · NG
```

The watermark is a deterrent against casual screenshots and sharing. It does not prevent a determined user from using developer tools; no browser-only reader can guarantee that.

## Why credentials sharing cannot be fully prevented

If the owner gives another person:

- the account email and password, and
- access to the account email inbox (for the transfer code),

that person can move the edition. The system cannot distinguish a legitimate owner from someone the owner deliberately authorised.

The controls above make sharing inconvenient and auditable. They do **not** make it impossible.

## Recommended next steps

1. **Add passkeys/WebAuthn** for account login and as a second factor for transfers. This is the strongest practical device binding for a web app.
2. **Add optional TOTP 2FA** for accounts, especially administrator and high-value reader accounts.
3. **Add a support override** for the 7-day/3-transfer limits, with an audit reason.
4. **Add a visible “signed-in devices” page** so readers can see and revoke sessions.
5. **Add account recovery** with a verified email and recovery codes; password reset is not implemented yet.
6. **Consider a forensic watermark** (session-specific dot pattern or invisible text) if piracy becomes a serious issue.
7. **Do not add hard IP binding.** Use IP/country only to trigger step-up verification and support review.

## Database repair

`worker/api/src/device-schema.js` adds the audit columns to databases created before this policy:

- `reader_devices.metadata_json`
- `device_transfer_audit.old_device_hash`
- `device_transfer_audit.new_device_hash`
- `device_transfer_audit.metadata_json`

The repair is idempotent and runs once per Worker isolate.
