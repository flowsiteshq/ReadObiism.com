# OBI-ISM mobile app

This folder contains the standalone Expo / React Native mobile project. It uses the OBI Worker API; it does not contain the website, PHP backend, database, private manuscript or payment secrets.

## Start

Install Node.js, pnpm and the Expo tooling for your device, then from this folder:

```powershell
pnpm install --frozen-lockfile
pnpm start
```

Use Expo Go or a compatible development build as appropriate. Android and iOS native builds require their respective toolchains. The existing app identity is `com.app.obiismreader`.

The app defaults to `https://readobiism.com` as its API. For isolated development, set `EXPO_PUBLIC_API_URL` to an approved, reachable test API before starting Expo. A physical phone's `localhost` is the phone itself, not your computer; the local PHP bridge is loopback-only and is not directly reachable from a phone. Never use live accounts or payment data as local fixtures.

The old bundled section summaries contained excerpts from the manuscript. This copy uses neutral placeholders for those summaries; licensed reader sections are requested from the API and kept in memory. Saved session and device identifiers still use AsyncStorage, inherited from the old app; secure storage, account/device recovery, local API connectivity and end-to-end purchase/reader testing require review before release.

The project was copied from the existing Expo app, with unused template OAuth/tRPC server dependencies removed. TypeScript and Expo configuration checks are separate from real Android/iOS device testing.
