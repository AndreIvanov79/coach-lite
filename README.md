# Coach Desk Lite

Telegram Mini App for coaches (bot [@coach_desk_lite_bot](https://t.me/coach_desk_lite_bot)): athletes, groups,
schedule and progress, with technique analysis of training videos done on the coach's own device by
[sport-coach-browser](https://andreivanov79.github.io/Sport-coach-browser/). Almost no backend: data lives in the
coach's Telegram CloudStorage; the bot (Telegram Serverless, later) keeps only athlete ↔ coach links.

Everything about the product, decisions and the work plan is in [SPEC.md](SPEC.md).

## What is here now

| Path | What |
|---|---|
| `shared/summary.ts` | The analysis summary that travels back from the analyzer in `startapp` (≤512 chars): `toSummary`, `encodeSummary`, `decodeSummary`. |
| `shared/handoff.ts` | Links between the Mini App and the analyzer: `analyzerUrl`, `parseFragment`, `returnLinks`, `openLinkOptions`. |
| `shared/fixtures/reports.json` | Numbers and finding codes from 9 real analyses (fitness, boxing, rhythmic gymnastics) for the tests. |

The analyzer keeps byte-identical copies of `summary.ts` and `handoff.ts` in `src/handoff/`. After changing
either file, copy it there; the test `the analyzer's copies are identical` checks this when the analyzer is at
`~/Dev/sport-coach-browser` (or set `ANALYZER_DIR`).

## Commands

Node 22.18 or newer.

```sh
npm install     # TypeScript, only for the type check
npm test        # node --test, no build step
npm run check   # tsc --noEmit
```
