# OBI-ISM Revised Scope and Approval-Aware Launch Plan

## Revised delivery position

The supplied proposal estimated **12 days** for a single-platform book-to-app conversion and Apple submission. That estimate no longer reflects the requested scope. OBI-ISM is now a **secure, commercially distributed iOS and Android reading product** that requires account-bound access, native-store purchase verification, protected-content delivery, content-security controls, two store listings, testing on physical devices, and review contingencies.

The appropriate planning range is **9–12 weeks from final manuscript, approved brand assets, completed store accounts, and product decisions**. This is an implementation-and-approval window, not a guarantee of store approval. The build portion is estimated at **8–10 weeks**; the final **1–2 weeks** are intentionally reserved for parallel App Store and Google Play review, submission corrections, and release activation. Apple reports that 90% of submissions are reviewed in less than 24 hours, but incomplete submissions can be delayed or fail review. Google states that certain accounts can experience review times of up to seven days or longer in exceptional cases. [1] [2]

## Store-compliant payment design

| Sales surface | Payment mechanism | Role in the launch |
|---|---|---|
| iOS application | **Apple In-App Purchase / StoreKit** one-time digital book product | Required native purchase path for the paid digital edition sold inside the App Store app. Apple describes In-App Purchase as the mechanism for selling premium content and digital goods inside an app. [3] |
| Android application | **Google Play Billing** one-time digital book product | Required native purchase path for a digital book sold inside the Google Play app. Google states that Play billing is required for in-app purchases of digital goods and services distributed on Google Play. [4] |
| Companion website | **Approved external payment options**, proposed as Stripe/Paystack/Flutterwave and, if commercially required, PayPal | Supports the requested payment breadth where local card, bank-transfer, and wallet options are needed. This requires a separate web checkout, web entitlement verification, support/refund process, and policy review before any cross-promotion from native apps. |

> **Decision required before payment implementation:** the business owner must approve the website payment provider set, currencies, countries, tax ownership, refund policy, and whether readers who purchase on the web may sign in to consume previously purchased content in the mobile apps. Native applications must not be designed around unapproved external digital-content checkout links.

## Security scope and realistic protection statement

The requested controls—non-shareable access, one download, one password, no screenshot, non-editable, read-only, and additional security—must be implemented as a layered service, not as a single switch. The mobile application foundation already includes read-only content presentation, local reading position and bookmarks, disabled export/share controls, and native screen-capture deterrence when the reader is open. The final release still requires a hosted entitlement service and physical-device test evidence.

| Requested outcome | Release implementation | Important limitation |
|---|---|---|
| One user / no password sharing | Account identity, session controls, registered-device limit, secure token storage, risk checks, password reset, and device-replacement support | A password alone cannot prove who is using it. Device binding and server-side entitlement validation are required. |
| One controlled download | Encrypted book package, server-minted content key, signed download receipt, and a server record of the registered device | A legitimate reader must have a defined support path after a lost or replaced device. |
| No screenshots | Native screen-capture prevention in protected reader screens and privacy protection in app-switcher previews | This is a strong platform-level deterrent, but it cannot prevent a person from photographing a display or using a modified device. The public claim must not promise absolute copy prevention. |
| Non-editable / read-only | Rendered, non-selectable reading view with no annotation, export, print, or share functions | Users can still visually read the content; security is aimed at reducing casual redistribution, not erasing all reproduction risk. |
| Additional security | TLS, encrypted-at-rest content, short-lived licenses, encrypted credential storage, root/jailbreak risk handling, audit events, watermarking, rate limits, and incident/support procedures | These controls require threat modeling, privacy/legal review, and ongoing operations. |

## Work plan

| Phase | Expected duration | Completion criteria |
|---|---:|---|
| Final inputs and commercial decisions | 1 week | Final proofread manuscript, cover/logo rights, final book price, territories/currencies, payment-provider decision, privacy and refund owner, Apple and Google account access. |
| Reader UX, content model, and branded mobile shell | 1–2 weeks | iOS/Android reader UI, chapter navigation, accessibility settings, protected-reader behavior, structured content import pipeline, and acceptance of the design system. The initial foundation is in place. |
| Identity, license, and protected-content service | 2–3 weeks | Account sign-in, device registration and replacement procedure, verified entitlement, signed/controlled content delivery, key rotation approach, audit logging, and support tooling. |
| Payments and commercial flows | 1–2 weeks | Apple IAP product, Google Play Billing product, receipt verification, restore-purchase flows, optional companion-site checkout, refunds/reconciliation policy, and end-to-end sandbox testing. |
| Security, accessibility, and release QA | 1–2 weeks | Physical iOS and Android test matrix, screen-capture deterrence tests, offline/online behavior, device-change paths, purchase restoration, accessibility checks, performance checks, privacy-policy review, store metadata, and release builds. |
| Store submission and approval buffer | 1–2 weeks, parallel where possible | App Store Connect and Play Console submissions, required review notes and test credentials, resolution of review questions, approved in-app products, staged release decision, and production release. |

## Release readiness checklist

The project should not enter store review until the final content and pricing are approved, Apple and Google developer accounts are active, store product IDs are configured, the privacy policy and terms are publicly hosted, a reviewer test account is available, and the reviewer can restore the relevant purchase. The security statement must accurately describe **deterrence and controlled access**, rather than absolute impossibility of copying.

## References

[1]: https://developer.apple.com/distribute/app-review/ "Apple Developer — App Review"
[2]: https://support.google.com/googleplay/android-developer/answer/9859751?hl=en "Google Play Console Help — Publish your app"
[3]: https://developer.apple.com/in-app-purchase/ "Apple Developer — In-App Purchase"
[4]: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en "Google Play Console Help — Understanding Google Play’s Payments policy"
