# 识字小助手 · Learning Chinese

Track the Chinese characters and idioms your children learn each week. Web first (also usable from a phone), iOS app later.
The app code is public; **the children's data is not in this repository** — it is stored in a separate **private** GitHub repository
that only a token of yours can read and write.

## One-time setup (about 3 minutes)

1. Create a **private** repository, e.g. `LearningData`, with a README (https://github.com/new).
2. Create a fine-grained token (https://github.com/settings/personal-access-tokens/new): *Only select repositories* → that repository;
   Repository permissions → **Contents: Read and write**. Keep the token secret.
3. Open the app, enter `owner/LearningData` and the token. On another device: Settings → *Sign in on another device* shows a QR code.
   (Without any account the app can also be tried out with *Use on this device*; the data then stays in that browser.)

## What it does now

- Home: the children (add / rename / delete). Tap a child to see the week.
- **This week**: the characters and idioms of the week (previous / next week), enter new ones — pasting is fine, spaces and punctuation are dropped,
  and characters / idioms **already learned are detected** (with the week) and skipped.
- **Learned**: every learned character in a 田字格 cell; tap the screen to show / hide pinyin; scroll up and down through all of them.
- **Import from Excel / Google Sheets**: one tab per child (the tab's name = the child's name), one row per week (`第1周-2026-10-25`, then the characters), a tab `成语` for the idioms. Download the sheet as .xlsx (Google Sheets: File → Download → Microsoft Excel) and choose it, or paste a tab's cells. A preview shows what is new and what is skipped before anything is saved.
- **Sign in without typing**: on the login screen tap *Sign in by scanning a QR code* and scan the code shown by a device that is already signed in (Settings → Sign in on another device).
- A child-friendly look: a colour and an animal for every child, a mascot, chunky buttons.
- Languages: 中文 / English / Français.

## Data (in the private repository)

```
kids.json          children + the first week
kids/<id>.json     characters of one child, by week
idioms.json        idioms, shared by all children, by week
```

## Develop

```bash
npm install
npm run dev            # http://localhost:5173/LearningChinese/
npm run build          # translations check + type check + build
npm run test:e2e       # browser tests with a pretend GitHub (see tests/README.md)
```
