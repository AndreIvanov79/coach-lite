# Coach Desk Lite

Telegram Mini App for coaches (bot [@coach_desk_lite_bot](https://t.me/coach_desk_lite_bot)): athletes, groups,
schedule and progress, with technique analysis of training videos done on the coach's own device by
[sport-coach-browser](https://andreivanov79.github.io/Sport-coach-browser/). Almost no backend: data lives in the
coach's Telegram CloudStorage; the bot (Telegram Serverless, later) keeps only athlete ↔ coach links.

Everything about the product, decisions and the work plan is in [SPEC.md](SPEC.md).

## Mini App (`miniapp/`)

React + Vite, no backend. The coach's data is kept in Telegram CloudStorage; changes that could not be sent wait
in an outbox on the device (Telegram DeviceStorage, else localStorage) and go out when the network is back.
Step 3 of the plan: "Accept" screen, Self-training / Coach, RU/EN/RO, Telegram theme and BackButton,
"New analysis" → analyzer in the browser, preview of a summary that comes back (saving comes with step 5).
`miniapp/public/{privacy,terms}.html` are short drafts (`CONSENT_VERSION = 0`); step 7 replaces them.

```sh
npm run dev            # http://localhost:5173/?mock — with a stand-in for Telegram (miniapp/test/telegram-mock.js)
                       #   options: &lang=ro &platform=tdesktop &theme=light &startapp=<summary> &version=6.4
npm run build          # miniapp/dist, ~60 KB gzip, relative paths
node scripts/qa-miniapp.mjs   # browser check of every screen with the stand-in; screenshots in artifacts/miniapp
```

Publishing: `deploy/github-pages.yml` (copy to `.github/workflows/pages.yml`) builds and publishes
`miniapp/dist` on GitHub Pages; that URL is the bot's Main Mini App in BotFather.

## What is here now

| Path | What |
|---|---|
| `shared/summary.ts` | The analysis summary that travels back from the analyzer in `startapp` (≤512 chars): `toSummary`, `encodeSummary`, `decodeSummary`. |
| `shared/handoff.ts` | Links between the Mini App and the analyzer: `analyzerUrl`, `parseFragment`, `returnLinks`, `openLinkOptions`. |
| `miniapp/` | The Mini App (see above). |
| `scripts/qa-miniapp.mjs` | Browser check of the Mini App. |
| `shared/fixtures/reports.json` | Numbers and finding codes from 9 real analyses (fitness, boxing, rhythmic gymnastics) for the tests. |

The analyzer keeps byte-identical copies of `summary.ts` and `handoff.ts` in `src/handoff/`. After changing
either file, copy it there; the test `the analyzer's copies are identical` checks this when the analyzer is at
`~/Dev/sport-coach-browser` (or set `ANALYZER_DIR`).

## Commands

Node 22.18 or newer.

```sh
npm install     # React, Vite, TypeScript, Playwright (for the browser check)
npm test        # node --test: summary codec, hand-off links, storage queue, profile, languages
npm run check   # tsc --noEmit for shared/ and miniapp/
```
