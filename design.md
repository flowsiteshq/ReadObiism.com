# OBI-ISM Mobile Design Specification

## Product intent

**OBI-ISM** is a focused, premium reading experience for *Building a Just Society Through Character: A Philosophy of Responsible Living*. The product should feel quiet, credible, and deliberate, with the reading experience prioritized over social features or visual noise. The initial release supports **portrait iOS and Android devices** and uses a one-handed navigation model.

## Brand and visual direction

The visual identity draws from the supplied cover. The primary brand color is **Foundation Green `#073E32`**, supported by **Warm Paper `#F7F3E8`**, **Ink `#15221E`**, **Heritage Gold `#B58B38`**, and **Soft Sage `#D7E4D9`**. Typography should privilege reading comfort: generous line height, high contrast, clear hierarchy, and no low-contrast decorative copy. Surfaces should be calm and editorial rather than imitating a physical bookshelf.

## Premium visual refinement

The redesign moves away from a generic dashboard composition and toward a **private reading salon**. The Library becomes a cinematic opening moment: the authentic supplied book cover sits inside a dark, full-bleed editorial panel, while the reader’s current chapter and progress are presented as a composed continuation card rather than a utilitarian list. The repeated deep green and warm-paper surfaces create contrast and depth; heritage gold is reserved for progress, rules, and quiet emphasis.

The Reader will adopt a deliberately spacious, book-like column with a calm top bar, a refined section marker, drop-cap opening, discreet progress rail, and an intentionally minimal lower control dock. The contents and access areas will use the same bespoke vocabulary of framed cards, micro-labels, subtle dividers, rounded yet restrained surfaces, and clear action hierarchy. The authentic cover image will be used on the Library and Access surfaces, satisfying visual richness without relying on generic stock imagery.

## Screen list

| Screen | Primary content | Key actions |
|---|---|---|
| Welcome and access | Cover, book subtitle, value statement, purchase/access status | Continue to library; begin supported purchase path; restore an eligible purchase |
| Library | Single licensed OBI-ISM book, download/access state, last-read position | Open book; view license status; restore purchase |
| Contents | Structured parts, chapters, current chapter indicator, progress | Jump to a chapter |
| Reader | Full chapter text, chapter title, reading progress, discreet protection notice | Next/previous chapter; open contents; adjust text size; add a local bookmark |
| Reader controls | Text size, theme preference, security status, bookmark list | Adjust reading settings; resume a bookmark |
| Account and device | Licensed account identity, password reset link, registered-device count, privacy/support links | Sign out; request device replacement through supported service |
| Purchase / restore | Store-specific purchase state and restore affordance | Start native store purchase when configured; restore a prior purchase |

## Key user flows

| User goal | Intended flow |
|---|---|
| Read the book | Launch app → Library → select OBI-ISM → Reader → continue from saved position |
| Navigate content | Reader → contents control → select a chapter → Reader at selected chapter |
| Resume later | Reader automatically saves local progress → relaunch → Library shows “Continue reading” → Reader resumes |
| Access after payment | Native store purchase or approved entitlement → entitlement verification → book becomes available in Library → first protected download is recorded |
| Reinstall or change device | Sign in → restore a verified store purchase → server evaluates the one-device/one-download rule → allow or direct the reader to support for a replacement review |

## Content-protection design

The product should not promise impossible protection. It will reduce casual copying and sharing through an account-bound license, store entitlement verification, encrypted-at-rest content, server-controlled device registration, secure credential storage, session expiry, root/jailbreak risk detection, disabled text selection/copy and share actions, visible user-specific watermarking, and reader-time screen-capture protection where the operating system permits it.

> iOS and Android do not permit any ordinary third-party app to guarantee that a reader cannot photograph or otherwise reproduce a screen. The product must describe this capability as **screen-capture deterrence and protection**, not an absolute no-copy guarantee.

Each purchase should map to **one named account, one active registered device, and one controlled offline content download**. A password is personal, cannot be technically made “unshareable” on its own, and therefore must be supplemented by device binding, authenticated sessions, anomaly/risk signals, credential-reset flows, and an account-recovery policy. The service must offer a narrowly defined device-change process so legitimate users are not permanently locked out after loss or replacement.

## Interaction and accessibility principles

The reader places the chapter title and exit/contents control in the upper reach area, while primary forward navigation and reader settings remain comfortably reachable near the lower edge. Touch controls maintain iOS-standard target sizing and use native navigation behavior. The initial design supports Dynamic Type, contrast-aware themes, semantic labels, and screen-reader-friendly logical chapter order. Content remains read-only; annotations, export, print, and sharing are intentionally out of scope.

## Delivery boundary for the initial foundation

The initial build establishes the branded reader UX, chapter navigation, durable local reading position, local bookmarks, content-use notice, and a clear entitlement/purchase placeholder. Store billing, a hosted account and entitlement service, encryption key management, a production DRM provider, real device registration, and final native screenshot-prevention configuration require the corresponding store accounts, backend configuration, legal/privacy assets, and physical-device validation before release.
