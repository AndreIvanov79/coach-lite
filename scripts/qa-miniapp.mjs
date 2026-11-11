// Mini App QA in Chromium with a stand-in for Telegram (miniapp/test/telegram-mock.js): outside Telegram, an old
// Telegram, first launch (Accept → mode), the analyzer link, BackButton, settings that survive a restart, a summary
// from the analyzer, and the offline outbox. telegram.org is never contacted.
// Usage: npm run build && node scripts/qa-miniapp.mjs [--chrome /path/to/chrome] [--out artifacts/miniapp]
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { toSummary, encodeSummary } from "../shared/summary.ts";

const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const dist = path.resolve("miniapp/dist"), out = path.resolve(arg("out", "artifacts/miniapp"));
await fs.mkdir(out, { recursive: true });
const mock = await fs.readFile("miniapp/test/telegram-mock.js", "utf8");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => { try { let f = path.join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!f.startsWith(dist)) throw 0; if ((await fs.stat(f)).isDirectory()) f = path.join(f, "index.html"); res.writeHead(200, { "Content-Type": types[path.extname(f)] ?? "application/octet-stream" }).end(await fs.readFile(f)); } catch { res.writeHead(404).end(); } });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port + "/";
const browser = await chromium.launch({ executablePath: arg("chrome", undefined) });
const errors = [];

async function phone({ telegram = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The real script would overwrite the stand-in; answer it with nothing.
  await ctx.route("https://telegram.org/**", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  if (telegram) await ctx.addInitScript(mock);
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(out, name + ".png") });
const cloud = page => page.evaluate(() => window.__tg.cloud());
const opened = page => page.evaluate(() => window.__tg.opened);
const backVisible = page => page.evaluate(() => document.documentElement.dataset.back === "1");

// Outside Telegram: explains itself and links to the bot.
{
  const page = await phone({ telegram: false });
  await page.goto(base);
  await page.waitForSelector("text=Open in Telegram");
  assert.equal(await page.getAttribute("a.button", "href"), "https://t.me/coach_desk_lite_bot?startapp");
  await page.context().close();
  console.log("outside Telegram: link to the bot");
}

// Telegram without CloudStorage (Bot API < 6.9).
{
  const page = await phone();
  await page.goto(base + "?mock&lang=ru&version=6.4");
  await page.waitForSelector("text=Обновите Telegram");
  await page.context().close();
  console.log("old Telegram: asks to update");
}

// First launch, Russian, Android.
const page = await phone();
await page.goto(base + "?mock&lang=ru&platform=android");
await page.waitForSelector("text=Перед началом");
assert.ok(!(await backVisible(page)), "no way back from the consent screen");
await shot(page, "1-consent");
await page.click("text=Политика конфиденциальности");
assert.match((await opened(page)).at(-1).url, /\/privacy\.html#ru$/);
await page.click("button:has-text('Принимаю')");
await page.waitForSelector("text=Как будете работать?");
assert.ok(!(await backVisible(page)));
await shot(page, "2-mode");
await page.click(".mode-card >> text=Self-training");
await page.waitForSelector("h1:text('Мой прогресс')");
await page.waitForTimeout(200);
let profile = JSON.parse((await cloud(page)).profile);
assert.equal(profile.mode, "self"); assert.equal(profile.accepted.version, 0); assert.ok(!profile.lang, "language follows Telegram until chosen");
await shot(page, "3-home-self");

// New analysis → the analyzer in Chrome with the Self-training context.
await page.click("button:has-text('Новый разбор')");
await page.waitForSelector("text=Что разбираем?");
assert.ok(await backVisible(page), "BackButton on inner screens");
await shot(page, "4-sport");
await page.click("button.row:has-text('Бокс')");
const link = (await opened(page)).at(-1);
assert.equal(link.url, "https://andreivanov79.github.io/Sport-coach-browser/boxing/#coach=1&ret=coach_desk_lite_bot");
assert.deepEqual(link.options, { try_browser: "chrome" });
await page.evaluate(() => window.__tg.back());
await page.waitForSelector("h1:text('Мой прогресс')");
assert.ok(!(await backVisible(page)));
console.log("first launch: consent → mode → home → analyzer link " + link.url);

// Settings: language and mode, kept in the cloud across a restart.
await page.click("button[aria-label='Настройки']");
await page.waitForSelector("h1:text('Настройки')");
await page.waitForSelector("text=Облако Telegram: занято ключей 1 из 1024");
await shot(page, "5-settings");
await page.click("role=radio[name='Română']");
await page.waitForSelector("h1:text('Setări')");
await page.click("role=radio[name='Coach']");
await page.waitForTimeout(200);
profile = JSON.parse((await cloud(page)).profile);
assert.equal(profile.lang, "ro"); assert.equal(profile.mode, "coach");
await page.reload();
await page.waitForSelector("h1:text('Sportivi')");
console.log("settings: Romanian + Coach survive a restart");

// Offline: the change waits on the device and goes out when the network is back.
await page.evaluate(() => window.__tg.offline(true));
await page.click("button.chip");
await page.click(".mode-card >> text=Self-training");
await page.waitForSelector(".sync-bar");
assert.match(await page.textContent(".sync-bar"), /Netrimise în cloud: 1/);
await shot(page, "6-offline");
assert.equal(JSON.parse((await cloud(page)).profile).mode, "coach", "not in the cloud yet");
await page.evaluate(() => window.__tg.offline(false));
await page.waitForSelector(".sync-bar", { state: "detached" });
assert.equal(JSON.parse((await cloud(page)).profile).mode, "self");
// Offline, then the app is closed: the outbox survives and is sent on the next start.
await page.evaluate(() => window.__tg.offline(true));
await page.click("button.chip");
await page.click(".mode-card >> text=Coach");
await page.waitForSelector(".sync-bar");
await page.reload();
await page.waitForSelector("h1:text('Sportivi')");
await page.waitForFunction(() => JSON.parse(window.__tg.cloud().profile).mode === "coach");
console.log("offline: queued, shown, sent when back online and after a restart");

// A summary from the analyzer (Self-training, then a damaged link).
const summary = toSummary({ id: "3f2a9c4e-8b1d-4e6f-9a2b-7c5d1e0f4a6b", sport: "boxing", exercise: "auto", createdAt: "2026-11-11T10:33:00Z", duration: 20.9, coverage: 1, count: 24,
  scalars: [{ id: "strikes", value: 24 }, { id: "guardAtStrike", value: -0.35 }, { id: "extension", value: 172 }], findings: [{ code: "guard_drop", kind: "fault", tone: "attention", focus: true }] });
const { param } = await encodeSummary(summary);
await page.goto(base + "?mock&lang=ru&platform=android&startapp=" + param);
await page.waitForSelector("h1:text('Analiză primită')");
assert.match(await page.textContent(".summary"), /Lovituri: 24/);
assert.ok(await backVisible(page));
await shot(page, "7-received");
await page.click("button:has-text('Gata')");
await page.waitForSelector("h1:text('Sportivi')");
await page.goto(base + "?mock&lang=ru&startapp=r1_AAAA");
await page.waitForSelector("text=deteriorat");
console.log("summary from the analyzer: shown, nothing saved; damaged link refused");

// Telegram Desktop: the analyzer opens in the default browser (no try_browser).
{
  const desk = await phone();
  await desk.goto(base + "?mock&lang=en&platform=tdesktop&user=7&theme=light");
  await desk.click("button:has-text('I accept')");
  await desk.click(".mode-card >> text=Self-training");
  await desk.click("button:has-text('New analysis')");
  await desk.click("button.row:has-text('Rhythmic gymnastics')");
  const l = (await opened(desk)).at(-1);
  assert.equal(l.url, "https://andreivanov79.github.io/Sport-coach-browser/rg/#coach=1&ret=coach_desk_lite_bot");
  assert.equal(l.options, null);
  await shot(desk, "8-light-en");
  await desk.context().close();
  console.log("Telegram Desktop: default browser; light theme");
}

assert.deepEqual(errors, [], "no page errors");
await browser.close(); server.close();
console.log("Mini App: all checks passed. Screenshots in " + path.relative(process.cwd(), out));
