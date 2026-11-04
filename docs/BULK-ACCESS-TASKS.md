# Bulk Access and Recipient Control — Task List

**Created:** 2026-11-04  
**Scope:** Shared-code bulk orders, individual seat links, phone-only accounts, device limits, revocation, audit, and support processes.  
**Related docs:** [BULK-ORDERS.md](BULK-ORDERS.md), [DEVICE-BINDING.md](DEVICE-BINDING.md), [DEPLOYMENT.md](DEPLOYMENT.md)

---

## Status key

- **Done** — implemented and verified.
- **Built, not enabled** — code exists but is off in production.
- **Not started** — no implementation yet.
- **Blocked** — waiting on a decision, credential, or external provider.

**Priority key**

- **P0** — needed before promising “only the intended recipient can claim.”
- **P1** — needed to make phone-only users fully supported.
- **P2** — hardening, operations, or optional control.

---

## Current baseline

| Area | Current state | Status |
|---|---|---|
| Single edition | One code binds to one active device. | Done |
| Single edition transfer | Password + email code, 7-day cooldown, max 3 per 180 days. | Done |
| Bulk shared code | One code, N claims, maximum 10,000 copies. One account can claim once per order. | Done |
| Bulk device limit | Each claimed copy binds to one device. Same copy cannot open on a second device. | Done |
| Individual seat links | Up to 500 seats; unique links, recipient assignment, revoke, reassign, CSV export. | Built, not enabled |
| Seat token rotation | Revoking and reassigning currently reuses the same seat link. | Not started |
| Shared-code claim revocation | No individual revoke for a claim made through a shared code. | Not started |
| Admin bulk claims | Admin sees order totals and seat counts, not the individual claim roster. | Not started |
| Phone accounts | Phone + password registration and login; no email required to read or claim. | Done |
| Phone verification | Phone numbers are not OTP-verified. | Not started |
| Phone password reset | No self-service password reset for any account type. | Not started |
| Phone device transfer | Transfer code is sent to the account email only. | Not started |
| Buyer receipt email | Phone or email can sign in; single and bulk checkout require a real receipt email. Order ownership stays with the account, not the receipt email. | Done |
| Google transfer | Google accounts have an internal random password; transfer asks for a password the user does not know. | Not started |
| Buyer receipt email | Bulk code and seat links are shown on the confirmation page; no automatic receipt email. | Not started |
| Watermarks and audit | Visible/invisible watermarks, reader feedback, device and transfer audit. | Done |
| Tests | 41 Worker tests passing. | Done |

---

# 1. Policy decisions — complete first

These decisions determine the implementation and the public promise.

- [ ] **BULK-001 — Choose the default bulk mode** · **P0**
  - **Options:** shared code only; individual seat links only; shared code by default with optional seats.
  - **Why:** shared code is simpler to distribute but is a bearer code. Seat links provide recipient control but add delivery and support work.
  - **Done when:** the default is documented and the buyer UI explains it before checkout.

- [ ] **BULK-002 — Set the seat-link threshold and fallback** · **P0**
  - **Current limit:** individual seat links up to 500 copies; shared code up to 10,000.
  - **Why:** when seats exist for an order, the shared code is intentionally disabled. Buyers must know whether they receive one code or N links.
  - **Done when:** the threshold is written down and server, buyer UI, and admin UI agree.

- [ ] **BULK-003 — Define the leaked-code response** · **P0**
  - **Options:** revoke one claim; revoke the whole order; reissue the code; refund or refuse refund.
  - **Why:** without a rule, support cannot act consistently when a recipient forwards a code.
  - **Done when:** the runbook states who can revoke, what happens to claimed copies, and the refund position.

- [ ] **BULK-004 — Decide whether one person or device may hold multiple copies** · **P0**
  - **Current rule:** one claim per account, not one claim per human or physical device.
  - **Why:** a determined user with multiple phone/email accounts can consume more than one copy.
  - **Done when:** either device deduplication is required, or the multi-account risk is accepted and documented.

- [ ] **BULK-005 — Set the phone verification level** · **P1**
  - **Options:** password-only phone accounts; OTP-verified phone for claiming; OTP-verified phone for claiming and transfers.
  - **Why:** without OTP, a phone number is only an identifier, not proof that the claimant owns it.
  - **Done when:** the required level is specified for claim, transfer, and password reset.

- [x] **BULK-006 — Decide the no-email buyer policy** · **P1**
  - **Decision:** a phone number can remain the login, but a buyer must enter a real email at checkout.
  - **Why:** Paystack/Stripe require an email for the receipt. The receipt email does not become the login identity.
  - **Done when:** the checkout copy and the single/bulk forms explain that the email is for the receipt only.

- [ ] **BULK-007 — Define refund and chargeback rules for bulk orders** · **P2**
  - **Why:** partial claims, leaked codes, revoked seats, and lost links all create dispute scenarios.
  - **Done when:** public terms and admin actions match.

---

# 2. Existing features — enable and verify

No new feature work is required for these, but production verification is.

- [ ] **BULK-010 — Enable individual seat links, if approved** · **P0**
  - **Action:** set `OBI_BULK_INDIVIDUAL_SEATS=1` in the production Worker environment.
  - **Why:** turns on the already-built per-seat path.
  - **Done when:** one real test order shows N seat links and no shared code.

- [ ] **BULK-011 — Verify the complete per-seat flow** · **P0**
  - **Flow:** pay → receive N links → assign recipient → claim → revoke → reassign → old link behaviour.
  - **Why:** the code exists, but the production flow and UI must be proven.
  - **Done when:** a test order passes end to end and results are recorded.

- [ ] **BULK-012 — Verify shared-code capacity** · **P0**
  - **Flow:** one code; N accounts claim; N+1 claim fails; same account cannot claim twice.
  - **Why:** confirms the maximum-device promise and prevents oversubscription.
  - **Done when:** capacity and one-claim-per-account are demonstrated in production.

- [ ] **BULK-013 — Verify a phone-only recipient can claim** · **P1**
  - **Flow:** create phone account → claim shared code or unassigned seat → open reader.
  - **Why:** this is the main no-email use case.
  - **Done when:** a phone-only test account reads successfully without email.

- [ ] **BULK-014 — Verify device binding and transfer** · **P1**
  - **Flow:** claim on device A → open on device B (blocked) → transfer → device A no longer works.
  - **Why:** confirms one active device per copy and replacement, not multiplication.
  - **Done when:** all three states are observed and logged.

- [ ] **BULK-015 — Verify admin bulk and audit pages** · **P2**
  - **Pages:** bulk orders, devices, transfers, forensics, feedback.
  - **Why:** support depends on these views after a claim dispute.
  - **Done when:** hard-refresh checks pass and data is present.

---

# 3. P0 engineering — recipient-level control

- [ ] **BULK-020 — Rotate seat tokens on revoke and reassign** · **P0**
  - **Current behaviour:** `assignBulkSeat` makes a revoked seat available again without changing its encrypted token.
  - **Why:** a leaked link that is revoked and reassigned becomes valid again.
  - **Files:** `worker/api/src/bulk-orders.js` — `ensureBulkSeats`, `assignBulkSeat`, `revokeBulkSeat`, `claimBulkSeat`.
  - **Done when:** revoke/reissue generates a new token; the old link fails; tests cover both paths.

- [ ] **BULK-021 — Add individual revocation for shared-code claims** · **P0**
  - **Why:** a leaked shared code can be claimed by an unintended person; today only per-seat claims can be revoked.
  - **Files:** `worker/api/src/bulk-orders.js`, `worker/dashboard-worker.js`, admin UI.
  - **Done when:** an admin or buyer can revoke one claim; the purchase status becomes revoked; reader access stops; capacity policy is explicit.

- [ ] **BULK-022 — Add an admin bulk claim roster** · **P0**
  - **Why:** the admin currently sees seat counts, not who claimed which copy, from which account/device, or when.
  - **Fields:** order, claimant account, email, phone, claim reference, device metadata, claim time, status.
  - **Also needed:** search by order/email/phone/reference and CSV export.
  - **Done when:** support can investigate a leaked shared code without database access.

- [ ] **BULK-023 — Enforce recipient phone matching on seat claims** · **P0**
  - **Current behaviour:** `recipient_phone` is stored, but `claimBulkSeat` checks only `recipient_email`.
  - **Why:** phone-assigned seats can currently be claimed by anyone holding the link.
  - **Dependency:** verified phone number from BULK-031/BULK-032.
  - **Done when:** a phone-assigned seat rejects a different or unverified phone.

- [ ] **BULK-024 — Add seat and claim expiry** · **P0**
  - **Why:** leaked links and forgotten seats currently remain usable indefinitely.
  - **Options:** fixed expiry from purchase; configurable claim window; expiry extended on reassignment.
  - **Done when:** expired seats return a clear error, admin shows expiry, and tests cover the boundary.

- [ ] **BULK-025 — Add buyer “reissue link” control** · **P0**
  - **Why:** a buyer needs to replace a lost or leaked seat link without reactivating the old one.
  - **Dependency:** BULK-020 token rotation.
  - **Done when:** the buyer can revoke and generate a new link, and the old link remains invalid.

- [ ] **BULK-026 — Send the buyer a durable bulk receipt/order link** · **P0**
  - **Why:** the code and seat links currently live on the confirmation page; closing the page creates a support case.
  - **Options:** email an authenticated order link rather than the raw code; show order history after sign-in.
  - **Done when:** the buyer can recover the order and links after losing the original tab.

- [ ] **BULK-027 — Record audit events for claim and seat changes** · **P0**
  - **Events:** seat assigned, seat revoked, seat reissued, claim revoked, claim transferred/cancelled.
  - **Why:** needed for disputes and for proving who changed what.
  - **Done when:** events appear in the order history/admin view.

---

# 4. P1 engineering — phone-only users

- [ ] **BULK-030 — Configure an SMS/WhatsApp OTP provider** · **P1** · **Blocked**
  - **Needs:** Meta WhatsApp Cloud API or Twilio account, sender identity, approved template, API credentials.
  - **Why:** OTP cannot be delivered without an external provider and approved message template.
  - **Done when:** a test OTP reaches a real phone in the target country.

- [ ] **BULK-031 — Add OTP request and verification endpoints** · **P1**
  - **Endpoints:** request code, verify code, resend with cooldown, attempt limits.
  - **Why:** needed for phone verification, phone transfer, and phone password reset.
  - **Done when:** codes expire, attempts are limited, and successful verification sets `phone_verified=1`.

- [ ] **BULK-032 — Add phone verification UI** · **P1**
  - **Where:** account creation, account settings, claim flow, transfer flow.
  - **Why:** users need a way to verify and re-verify a phone number.
  - **Done when:** the UI handles success, expired code, wrong code, and resend states.

- [ ] **BULK-033 — Add phone-based password reset** · **P1**
  - **Why:** there is currently no self-service password reset for any account type; a phone-only user otherwise loses access permanently.
  - **Done when:** a verified phone can reset the password; email accounts can use the existing email path.

- [ ] **BULK-034 — Add phone-based device transfer** · **P1**
  - **Why:** transfer codes currently go to the account email; phone-only users cannot receive them.
  - **Done when:** a verified phone can receive the transfer code, with the same cooldown and attempt limits as email.

- [x] **BULK-035 — Require a real receipt email at checkout** · **P1**
  - **Implemented:** single and bulk checkout accept a receipt email separate from the account identity.
  - **Ownership:** purchases and bulk orders remain tied to the signed-in account, so a phone login can recover the order.
  - **Why:** Paystack/Stripe require an email, but recipients still do not need one.
  - **Done when:** a phone buyer can pay and retrieve the order using the account session, with the receipt sent to the real email.

- [ ] **BULK-036 — Add/change phone or email on an account** · **P1**
  - **Why:** users change numbers, add email later, or need to merge a phone purchase with an email identity.
  - **Done when:** changes are verified, audited, and do not create duplicate ownership.

- [ ] **BULK-037 — Fix device transfer for Google-only accounts** · **P1**
  - **Current issue:** Google sign-in creates an internal random password; transfer asks for a password the user does not know.
  - **Why:** Google-only readers may be unable to move devices.
  - **Done when:** Google re-authentication or a “set password” flow is available before transfer.

---

# 5. P2 engineering — hardening and optional control

- [ ] **BULK-040 — Deduplicate devices across claims in one order** · **P2**
  - **Why:** closes the multi-account/one-device loophole.
  - **Caution:** decide whether a device may legitimately hold multiple copies before enforcing.
  - **Done when:** the chosen rule is enforced and tested.

- [ ] **BULK-041 — Add buyer claim approval** · **P2**
  - **Flow:** claimant requests access → buyer approves/rejects → access granted.
  - **Why:** strongest recipient control, but adds friction and support work.
  - **Done when:** approval, rejection, and expiry are audited.

- [ ] **BULK-042 — Auto-deliver seat links to recipients** · **P2**
  - **Options:** email or WhatsApp the assigned recipient their link.
  - **Why:** reduces buyer manual work; does not prevent forwarding by itself.
  - **Done when:** delivery status is visible and failures can be retried.

- [ ] **BULK-043 — Add abuse detection and alerts** · **P2**
  - **Signals:** same device across multiple claims, rapid claim spikes, unusual geography, repeated failed claims.
  - **Why:** IP is audit context, not a binding key, but it helps detect sharing.
  - **Done when:** alerts are visible to admin and do not auto-block legitimate users without review.

- [ ] **BULK-044 — Add a buyer order-history page** · **P2**
  - **Why:** buyers need a durable place to find past orders, codes, and seat links.
  - **Done when:** signed-in buyers see orders and can reopen the confirmation page.

- [ ] **BULK-045 — Update terms and privacy for bulk/phone data** · **P2**
  - **Cover:** bearer-code risk, device binding, revocation, refund rules, phone numbers, OTP, device metadata, IP audit, retention.
  - **Why:** sets expectations and supports enforcement.
  - **Done when:** legal review is complete and pages are published.

- [ ] **BULK-046 — Write the support runbook** · **P2**
  - **Cover:** leaked code, lost device, lost phone, lost seat link, buyer with no email, Google transfer, refund/chargeback.
  - **Why:** turns policy into repeatable support actions.
  - **Done when:** support can resolve each scenario without engineering.

---

# 6. Testing and rollout

- [ ] **BULK-050 — Backend unit tests** · **P0**
  - **Cover:** token rotation, shared-claim revocation, phone matching, expiry, claim roster, receipt email.
  - **Why:** protect the capacity and binding rules.
  - **Done when:** tests pass with existing 41-test suite.

- [ ] **BULK-051 — End-to-end tests** · **P0**
  - **Cover:** shared-code claim, email-assigned seat, phone-assigned seat, wrong email, wrong phone, revoke/reissue, lost link, phone-only claim, Google transfer.
  - **Why:** the risky bugs are in the cross-page flow, not isolated functions.
  - **Done when:** a scripted test account completes each flow.

- [ ] **BULK-052 — Concurrency tests** · **P0**
  - **Cover:** last available claim at the capacity boundary; simultaneous seat claims; repeated retries.
  - **Why:** oversubscription and double-binding are the highest-risk failures.
  - **Done when:** no order exceeds its quantity and no copy binds twice.

- [ ] **BULK-053 — Enable per-seat mode on one real order** · **P0**
  - **Why:** validates the production flag, email delivery, UI, and support process before broad rollout.
  - **Done when:** one order is completed, claimed, revoked, and reassigned.

- [ ] **BULK-054 — Keep a rollback switch** · **P0**
  - **Why:** if seat delivery or claims fail, shared-code mode must remain available.
  - **Done when:** disabling the flag restores shared-code behaviour without data loss.

- [ ] **BULK-055 — Update deployment and operations docs** · **P2**
  - **Cover:** new env vars, provider credentials, claim roster, revocation steps, expiry configuration.
  - **Why:** prevents production drift.
  - **Done when:** docs match the deployed code.

---

# 7. External dependencies and blockers

- [ ] **BULK-060 — Obtain WhatsApp/SMS provider credentials and template approval** · **P1** · **Blocked**
  - **Why:** phone OTP, phone transfer, and phone reset cannot work without this.
  - **Owner:** account owner / operations.

- [ ] **BULK-061 — Confirm payment-provider email requirements** · **P1** · **Blocked**
  - **Why:** determines whether a no-email buyer can ever complete checkout without a contact email.
  - **Owner:** payments/product.

- [ ] **BULK-062 — Legal review of bulk and phone terms** · **P2**
  - **Why:** refund, revocation, privacy, and data-retention wording must be enforceable.
  - **Owner:** legal/product.

- [ ] **BULK-063 — Decide whether to enable individual seat links in production** · **P0**
  - **Why:** this single flag changes the buyer promise and support model.
  - **Owner:** product.

---

# 8. Definition of done for the overall goal

The work is complete when all of the following are true:

- [ ] Single edition is confirmed as **one active device** at a time.
- [ ] Bulk shared code is confirmed as **N copies / N claims / maximum 10,000**.
- [ ] Each claimed copy is bound to one account and one device.
- [ ] A bulk buyer receives either one shared code or N assigned seat links, clearly explained before payment.
- [ ] A phone-only recipient can create an account, claim a copy, read, and recover access.
- [ ] A phone-only recipient can transfer to a new device, or a documented support path exists.
- [ ] A leaked seat link can be revoked and replaced with a new link; the old link stays invalid.
- [ ] A leaked shared-code claim can be individually revoked without cancelling the whole order.
- [ ] Admin can see who claimed each copy and investigate a sharing report.
- [ ] Terms, privacy, support runbook, and buyer instructions match the implemented behaviour.
- [ ] Existing tests pass, new tests cover the new rules, and production has a rollback switch.

---

## Suggested execution order

1. Complete **BULK-001 to BULK-007** decisions.
2. Verify the current baseline in production (**BULK-011 to BULK-015**).
3. Build **BULK-020 to BULK-027** recipient-control changes.
4. Add **BULK-030 to BULK-037** phone-only support, starting with the OTP provider.
5. Add **BULK-040 to BULK-046** hardening and operations.
6. Run **BULK-050 to BULK-055** tests and staged rollout.
7. Publish terms, support runbook, and buyer instructions last, after the behaviour is stable.
