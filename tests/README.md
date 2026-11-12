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
| 16-google-sheet-sync | the Google Sheets sync script run against a PRETEND sheet + GitHub: layout A / B..K / L, re-sync, errors, auto-sync switch, read-only, no personal data (a real Google account is NOT covered) |
| 18-game | the game: the memory-curve rules (Node) and the screen (shared by every child, ring, time-out, tick / cross, retries, leaving, saving, sizes, languages) |
| 19-light-only | no dark mode: the page declares "only light" (meta + CSS), there is no dark rule, a phone in dark mode shows exactly the same screens (real "auto dark" of a phone browser can not be reproduced here) |
| 20-idioms | the shared idiom list and story page: button on the week page, adding, story editing, shared by every child, back, centred, English / French |
| 21-practice-sheet | the practice sheet: stroke counts and order, pinyin, cell rows, one A4 page as a real PDF, nothing fetched from outside, license notice, rare characters, English / French on a 320 px phone |
| 22-idiom-pool | the idiom library: import of the 成语 tab with tick boxes, ticked ones given weeks (6 a week), the rest kept, weekly random pick for next week, English / French |
| 23-story-sheet | the story printout: 3 stories per A4 page in 14 pt, 2 pages per week (one sheet, both sides), shrink / warn for long stories, real PDFs, English / French |
| 24-story-library | Built-in story library: length, characters, plain text; stories come along with the weekly random pick (no Settings card) |
| 25-sheet-write-chars | the sheet for a child who reads more than he writes: typed characters to write, this week's / last week's characters to read at both ends in random order, per child, remembered, one A4 PDF page, English / French |
| 26-settings-sections | Settings headings in order, every control under the right one, the admin block slides open / shut (no redraw) |
| 27-admin-password | Admin mode password: chosen twice the first time, asked afterwards, wrong / cancel change nothing, only a hash kept, change it, not remembered, EN / FR |
| 15-app-icon | the app icon: sizes, no transparency (iOS), fills the square, safe area, in sync with assets/icon/icon.svg, links + manifest |
| 14-picture-and-colour | tap the picture at the top of a child page: picture + colour window, live preview, Done / Cancel, the colour changes the whole look, contrast, fits a small phone |
| 13-manage-mode | manage mode (Settings): a red - on every character to delete a wrongly entered one; cancel is silent; also in "Learned"; the + comes back below 10; an emptied week disappears; sizes on 5 screens |
| 12-children-settings-avatar | children are managed in Settings; pictures: 12 animals, a photo from the library (cut square, small JPEG), the camera, bad file, refused camera, cancel, second device |
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
