# OBI-ISM Mobile Design Specification

## Product intent

**OBI-ISM** is a premium reading ecosystem for *Building a Just Society Through Character: A Philosophy of Responsible Living*. It should feel purposeful, alive, and unmistakably authored—not like a generic e-reader. The experience must combine focused reading with useful private discovery tools: a reading path, chapter search, principles explorer, progress momentum, bookmarks, and a personal edition dashboard. The initial release supports **portrait iOS and Android devices** and uses a one-handed navigation model.

## Brand and visual direction

The new direction is **Civic Energy**. It extends the supplied cover into a contemporary public-minded palette: **Indigo Ink `#151A52`**, **Signal Coral `#FF5B55`**, **Civic Lime `#DFFF4F`**, **Electric Sky `#6CD9FF`**, **Warm Paper `#FFF6E7`**, and **Charcoal `#1C1C26`**. Indigo carries authority, coral carries movement and action, lime marks progress and discovery, and sky adds optimism. The cover remains the authentic visual anchor, while large color fields, bold editorial type, circular “signal” motifs, and modular cards make the product feel more memorable.

## Premium visual refinement

The redesign moves away from a private reading salon toward an **active civic reading studio**. The Library is a visual command center: a high-color cover stage, a live reading pulse, a weekly progress signal, and a “principle of the day.” The explore area provides search, sections, bookmarks, and a practical four-principle compass. Visual movement comes from restrained color shifts, layered circular signals, strong progress shapes, and tactile button feedback rather than gratuitous animation.

## Minimal cinematic welcome screen

The native app now opens on a full-bleed, muted Nigerian-landmark video rather than a crowded dashboard. The supplied MyDojo reference informs the **minimal, immersive hierarchy only**: a single OBI-ISM identity lockup, compact menu affordance, concise philosophical statement, and two clear actions. The status indicators remain light over the video, while the OBI-ISM header is inset beneath them for clarity. Reader, Explore, Contents, and My Edition remain one tap away inside the full-screen menu rather than competing for attention at launch.

The Reader retains a spacious, legible reading column but adds a richer utility layer: a high-contrast chapter signal, visual completion ring, section path indicator, quick bookmark action, font-size control, and next-step prompt. The contents, Explore, and My Edition areas use color-blocked modules, badge-like milestones, magnetic headline typography, and clear action hierarchy. All content remains read-only; reader intelligence stays private to the device and never creates a public sharing or annotation flow.

## Screen list

| Screen | Primary content | Key actions |
|---|---|---|
| Welcome and access | Cover, book subtitle, value statement, purchase/access status | Continue to library; begin supported purchase path; restore an eligible purchase |
| Library | Book stage, live reading position, completion signal, reading goal, principle prompt | Continue reading; set reading goal; open a principle or section |
| Explore | Full-text chapter search, bookmarks, part map, principle compass | Search a chapter; resume bookmark; jump to a section |
| Contents | Structured parts, chapters, current chapter indicator, progress | Jump to a chapter |
| Reader | Full chapter text, chapter title, reading progress, chapter signal, discreet protection notice | Next/previous chapter; open contents; adjust text size; add a local bookmark |
| My Edition | Personal access, reading rhythm, goal selection, bookmark count, security status | Set reading goal; resume a bookmark; request device support |
| Account and device | Licensed account identity, password reset link, registered-device count, privacy/support links | Sign out; request device replacement through supported service |
| Purchase / restore | Store-specific purchase state and restore affordance | Start native store purchase when configured; restore a prior purchase |

## Key user flows

| User goal | Intended flow |
|---|---|
| Read the book | Launch app → Library → select OBI-ISM → Reader → continue from saved position |
| Find an idea | Launch app → Explore → search a title, part, or term → select a result → protected Reader |
| Build a reading rhythm | Library or My Edition → select a private weekly reading goal → read a section → progress signal updates locally |
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
