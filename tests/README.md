# End-to-end tests

Browser tests (Playwright + Chromium, touch-sized windows) against the app running with a **pretend GitHub**
(`e2e/harness.cjs` answers the GitHub contents API of a repository `demo/LearningData` from memory, including the
409 answer when two devices change a file at the same time), so nothing real is touched. `suites.txt` lists the suites:

| suite | what it proves |
|---|---|
| 01-login-and-local | wrong token / public repo / read-only token refused, QR sign-in, sign out, this-device mode makes no GitHub request |
| 02-kids-weeks-duplicates | 3 children, entering a week, "already learned?" detection (with the week), shared idioms, week navigation, rename / delete, cancel = no message |
| 03-learned-grid | every learned character in a 田字格, tap = show / hide pinyin, scrolling through 70 characters |
| 04-github-storage | which files are written, UTF-8, second device, two devices at once are merged, lost connection is reported, delete |
| 10-week-page-and-viewer | the week page (today first, forward only, plus buttons) and the full-screen character (tap, buttons, swipe, arrow keys, pinyin) |
| 11-centering-devices | equal space left / right on 11 emulated screens (iPhone, iPad, desktop), full-screen character exactly centred, nothing overlapping |
| 09-update | Settings -> check for updates / force refresh (cache cleared, still signed in), the new-version bar, on a real production build; the iOS build has none of it |
| 08-import-excel | import from Excel / Google Sheets: real .xlsx files, the user's layout, preview, duplicates, paste, bad files, cancel writes nothing |
| 07-scan-login | the login screen scans a QR code with the camera (pretend camera): good code, other code, refused camera, bad token, camera switched off, en / fr |
| 06-look | an animal + colour per child (stable, different), mascot, readable white text on every colour, animations off with "reduce motion" |
| 05-languages-and-layout | zh / en / fr: no Chinese UI text left, nothing cut off on a phone and two tablets; screenshots `tests/out/work/layout-*.png` — **look at them** when a screen is new |

Run everything: `npm run test:e2e`. One suite: `tests/run-all.sh 03-learned-grid`.
Rules: a new feature or a fixed bug gets a suite (or a check) in the same change; a test must fail on the old code
(check it before trusting it). Output (screenshots, logs) goes to `tests/out/` (ignored by git).

Not testable here: a real iPad / iPhone (safe areas are emulated), a real GitHub account, real Apple accounts, real children using it.
