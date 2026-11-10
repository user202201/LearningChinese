# 识字小助手 (Learning Chinese) — standing rules for every change

This app records which Chinese characters (汉字) and idioms (成语) the children learned each week. It is modelled on the sibling
project PianistAssistant (same login, same storage idea, same test approach). The final target is an iOS app; the web version comes first.

1. **Languages.** The UI is Chinese / English / French (`src/i18n.ts`, texts in `src/i18n-data.ts`, keyed by the Chinese source text).
   Every new or changed UI text needs an EN and FR entry. `npm run check:i18n` (part of `npm run build`, the deploy workflow and the tests workflow) fails when one is missing.
   The user's own texts (child names, characters, idioms) are marked with the CSS class `user` / `user-title` and are never translated — keep marking them.
   Never add a one-character key to the translation tables for a UI word without the `user` protection being in place.
2. **Always build before pushing:** `npx tsc --noEmit && BASE_PATH=/ npx vite build`.
3. **Web must keep working.** The GitHub Pages site (`/LearningChinese/`) and the iOS app (relative base, `MOBILE=1`) are built from the same code.
   Nothing that only works at one of them (absolute asset paths, server-only features).
4. **Storage.** Data access goes through `src/api.ts` only (`readJson` / `update` / `remove`). `update` is read-modify-write with retry on a
   GitHub 409, so two devices editing at once are merged — keep every write in that shape. Data lives in a PRIVATE repository (never in this public one);
   the login refuses a public data repository.
5. **Data layout** (`src/model.ts`): `kids.json`, `kids/<id>.json` (characters of ONE child — each child learns different ones), `idioms.json` (shared by all children).
   A week is Sunday–Saturday, numbered from the first week entered (`startWeek`). Rules on the data (duplicates, week numbers) live in `model.ts`, not in the screens.
6. **Tests.** End-to-end suites in `tests/` (see `tests/README.md`); `npm run test:e2e` runs them. Every new feature and every fixed bug gets a suite (or a check)
   in the same change, and the test must fail on the old code. New screens must also pass `05-languages-and-layout` (no overflow / clipping / Chinese left over
   in en / fr on a phone and tablets) and be looked at in the screenshots it saves.
7. **Answer the user in Chinese, step by step, and be honest about what could not be tested** (real iPad / iPhone, real children, real GitHub account, speech recognition accuracy).
8. **Every action answers.** Each user action that takes time or changes data shows a message through `toast()` (`src/ui.ts`): `working=true` (spinner) while it runs,
   closed when done, then a result message (or the error). Messages are always in the top band. Cancelling a confirmation must not produce a "done" message.
9. **Automate.** Anything needed on every release (translations check, tests, deploy) belongs in a workflow or script (`.github/workflows/`), not in a to-do list for the user.
10. **Camera.** The login screen scans a sign-in QR code with the camera (`src/scan.ts`); the iOS app will need the camera permission text (`NSCameraUsageDescription`) when it is packaged.
11. **Planned, not built yet** (agreed with the user, see README): full-screen big character with left/right swipe, game mode (10 s countdown ring, wrong answers come back at the end,
    adult taps right / wrong; speech recognition only as an optional experiment), weekly review by spaced repetition, Excel (.xlsx) import / paste / export, iOS packaging (Capacitor).
