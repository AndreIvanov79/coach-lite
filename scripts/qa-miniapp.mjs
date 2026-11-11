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

// A summary from the analyzer arrives in the Romanian Coach session: preview, nothing saved without a tap.
const boxing = (id, minute, values) => encodeSummary(toSummary({ id, sport: "boxing", exercise: "bag", createdAt: new Date(Date.UTC(2026, 10, 11, 10, minute)), duration: 20.9, coverage: 1, count: values[0],
  scalars: [{ id: "strikes", value: values[0] }, { id: "guardAtStrike", value: values[1], digits: 2 }, { id: "extension", value: values[2], digits: 0 }],
  findings: [{ code: "guard_drop", kind: "fault", tone: "attention", focus: true }, { code: "strong_rotation", kind: "strength", tone: "good" }] }, values[3] ? { athlete: values[3] } : {})).then(e => e.param);
await page.goto(base + "?mock&lang=ru&platform=android&startapp=" + await boxing("3f2a9c4e-8b1d-4e6f-9a2b-7c5d1e0f4a6b", 33, [24, -0.35, 172]));
await page.waitForSelector("h1:text('Analiză primită')");
assert.match(await page.textContent(".summary"), /Lovituri: 24/);
assert.ok(await backVisible(page));
await page.evaluate(() => window.__tg.back());
await page.waitForSelector("h1:text('Sportivi')");
assert.ok(!Object.keys(await cloud(page)).some(k => k.startsWith("self_")), "nothing saved without the tap");
await page.goto(base + "?mock&lang=ru&startapp=r1_AAAA");
await page.waitForSelector("text=deteriorat");
console.log("summary from the analyzer: preview only; damaged link refused");

// My progress (new user, Russian): the first summary arrives before setup, is saved, a second one makes a chart.
{
  const p = await phone();
  const first = await boxing("a1111111-1111-4111-8111-111111111111", 10, [18, -0.52, 158]);
  await p.goto(base + "?mock&lang=ru&platform=android&user=3&startapp=" + first);
  await p.click("button:has-text('Принимаю')");
  await p.click(".mode-card >> text=Self-training");
  await p.waitForSelector("h1:text('Получен разбор')");
  const text = await p.textContent(".screen");
  for (const s of ["Работа на мешке", "Ударов: 18", "Вторая рука опускается при ударе", "Корпус вкладывается в удар", "Гард второй руки при ударе", "−0,52 × торс", "158°"]) assert.ok(text.includes(s), "shows " + s);
  await shot(p, "7-received");
  await p.click("button:has-text('Сохранить в «Мой прогресс»')");
  await p.click("button:has-text('Открыть')");
  await p.waitForSelector("text=График появится, когда будет хотя бы два разбора");
  await p.goto(base + "?mock&lang=ru&platform=android&user=3&startapp=" + await boxing("b2222222-2222-4222-8222-222222222222", 50, [26, -0.21, 171]));
  await p.click("button:has-text('Сохранить в «Мой прогресс»')");
  await p.click("button:has-text('Открыть')");
  await p.waitForSelector("svg.chart");
  assert.equal(await p.locator("svg.chart circle").count(), 2);
  assert.match(await p.textContent(".chart-card h3"), /Гард второй руки при ударе/);
  await p.click("button.figure:has-text('Разгибание локтя при ударе')");
  assert.match(await p.textContent(".chart-card h3"), /Разгибание локтя/);
  await p.evaluate(() => scrollTo(0, 0));
  await shot(p, "8-detail-chart");
  await p.evaluate(() => window.__tg.back());
  await p.waitForSelector("text=Разборов: 2");
  await shot(p, "9-progress");
  // The same link again: already saved. An athlete's summary: not saved until athletes exist.
  await p.goto(base + "?mock&lang=ru&user=3&startapp=" + first);
  await p.waitForSelector("text=Этот разбор уже сохранён.");
  await p.goto(base + "?mock&lang=ru&user=3&startapp=" + await boxing("c3333333-3333-4333-8333-333333333333", 55, [20, -0.3, 165, "Ab12Cd34"]));
  await p.waitForSelector("text=Это разбор для ученика");
  assert.equal(await p.locator("button:has-text('Сохранить')").count(), 0);
  // Delete one.
  await p.evaluate(() => window.__tg.back());
  await p.click("button.item >> nth=0");
  await p.click("button:has-text('Удалить разбор')");
  await p.waitForSelector("text=Разборов: 1");
  const keys = await cloud(p);
  assert.deepEqual(Object.keys(keys).filter(k => k.startsWith("self_")), ["self_1"]);
  assert.equal(JSON.parse(keys.self_1).items.length, 1);
  assert.ok(!keys.self_1.includes("Ab12Cd34"));
  await p.context().close();
  console.log("My progress: saved after the tap, once; chart of any figure; athlete summaries wait; delete");
}

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
  await shot(desk, "10-light-en");
  await desk.context().close();
  console.log("Telegram Desktop: default browser; light theme");
}

assert.deepEqual(errors, [], "no page errors");
await browser.close(); server.close();
console.log("Mini App: all checks passed. Screenshots in " + path.relative(process.cwd(), out));
