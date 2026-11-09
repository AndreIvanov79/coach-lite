import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyzerUrl, buildFragment, parseFragment, returnLinks, cleanName, openLinkOptions, ANALYZER_BASE, NAME_MAX } from "./handoff.ts";
import { toSummary, encodeSummary, decodeSummary } from "./summary.ts";

const ALLOWED = ["coach_desk_lite_bot"];
const ret = { bot: "coach_desk_lite_bot" };

test("the analyzer link carries the context in the fragment only", () => {
  const url = analyzerUrl("fitness", { athlete: "Ab12Cd34", name: "Иван Петров", ret, inbox: "x7Yq" });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, ANALYZER_BASE + "fitness/");
  assert.equal(u.search, "", "nothing goes to the server");
  assert.deepEqual(parseFragment(u.hash, ALLOWED), { ret, athlete: "Ab12Cd34", name: "Иван Петров", inbox: "x7Yq" });
  assert.equal(analyzerUrl("rg", { ret }, "https://example.org/sc"), "https://example.org/sc/rg/#coach=1&ret=coach_desk_lite_bot");
  assert.throws(() => analyzerUrl("rg", { ret }, "http://example.org/"));
  assert.throws(() => analyzerUrl("chess" as "rg", { ret }));
  assert.throws(() => buildFragment({ ret, athlete: "a b" }));
  assert.throws(() => buildFragment({ ret: { bot: "x" } }));
});

test("coach mode only for an allowed return target", () => {
  assert.equal(parseFragment("#coach=1&ret=evil_collector_bot&a=Ab12", ALLOWED), null);
  assert.equal(parseFragment("#coach=1&a=Ab12", ALLOWED), null, "no target");
  assert.equal(parseFragment("#ret=coach_desk_lite_bot", ALLOWED), null, "no coach flag");
  assert.equal(parseFragment("", ALLOWED), null);
  assert.deepEqual(parseFragment("#coach=1&ret=Coach_Desk_Lite_Bot", ALLOWED), { ret: { bot: "Coach_Desk_Lite_Bot" } }, "usernames are case-insensitive");
  assert.equal(parseFragment("#coach=1&ret=coach_desk_lite_bot/app", ALLOWED), null, "a Mini App name must be allowed explicitly");
  assert.deepEqual(parseFragment("#coach=1&ret=coach_desk_lite_bot/app", ["coach_desk_lite_bot/app"]), { ret: { bot: "coach_desk_lite_bot", app: "app" } });
  assert.equal(parseFragment("#coach=1&ret=coach_desk_lite_bot/a/b", ALLOWED), null);
  assert.equal(parseFragment("#coach=1&ret=coach_desk_lite_bot&a=../x", ALLOWED), null, "bad athlete id");
  assert.equal(parseFragment("#coach=1&ret=coach_desk_lite_bot&in=" + "x".repeat(41), ALLOWED), null, "bad inbox id");
});

test("names are cleaned for the banner", () => {
  assert.equal(cleanName("  Анна \n\t Смирнова‮  "), "Анна Смирнова");
  assert.equal(cleanName("\u0000​"), "");
  assert.equal(Array.from(cleanName("😀".repeat(100))).length, NAME_MAX);
  assert.deepEqual(parseFragment("#coach=1&ret=coach_desk_lite_bot&n=%20%20", ALLOWED), { ret }, "an empty name is dropped");
});

test("return links match the formats checked on devices", () => {
  const links = returnLinks(ret, "r1_abc-DEF_9");
  assert.equal(links.tme, "https://t.me/coach_desk_lite_bot?startapp=r1_abc-DEF_9");
  assert.equal(links.web, "https://web.telegram.org/k/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3Dcoach_desk_lite_bot%26startapp%3Dr1_abc-DEF_9");
  const app = returnLinks({ bot: "coach_desk_lite_bot", app: "desk" }, "r0_x");
  assert.equal(app.tme, "https://t.me/coach_desk_lite_bot/desk?startapp=r0_x");
  assert.equal(decodeURIComponent(app.web.split("tgaddr=")[1]), "tg://resolve?domain=coach_desk_lite_bot&appname=desk&startapp=r0_x");
  assert.throws(() => returnLinks(ret, "has space"));
  assert.throws(() => returnLinks(ret, "x".repeat(513)));
  assert.throws(() => returnLinks({ bot: "bad/name" }, "r0_x"));
});

test("openLink: Chrome on Android, the default browser elsewhere", () => {
  assert.deepEqual(openLinkOptions("android"), { try_browser: "chrome" });
  for (const p of ["ios", "web", "weba", "tdesktop", "macos", "unknown"]) assert.equal(openLinkOptions(p), undefined);
});

test("the whole trip: Mini App -> analyzer -> Mini App", async () => {
  const opened = new URL(analyzerUrl("boxing", { athlete: "Ab12Cd34", name: "Max", ret }));
  const ctx = parseFragment(opened.hash, ALLOWED);
  assert.ok(ctx);
  const summary = toSummary({
    id: crypto.randomUUID(), sport: "boxing", exercise: "auto", detected: "bag", createdAt: new Date(), duration: 92.4, coverage: 0.93, count: 41,
    scalars: [{ id: "strikes", value: 41 }, { id: "guardAtStrike", value: 0.62 }], findings: [{ code: "guard_drop", kind: "fault", tone: "attention", focus: true }]
  }, { athlete: ctx.athlete, inbox: ctx.inbox });
  const { param } = await encodeSummary(summary);
  const back = new URL(returnLinks(ctx.ret, param).tme);
  const got = await decodeSummary(back.searchParams.get("startapp"));
  assert.deepEqual(got, summary);
  assert.equal(got?.a, "Ab12Cd34");
  assert.doesNotMatch(back.href, /Max/, "the name never leaves the analyzer");
});

// The analyzer (sport-coach-browser) keeps copies of these two files; they must stay identical.
// Found through ANALYZER_DIR, or at ~/Dev/sport-coach-browser next to ~/Dev/python_projects/coach-lite, or beside coach-lite.
const roots = [process.env.ANALYZER_DIR && pathToFileURL(process.env.ANALYZER_DIR + "/").href, "../../../sport-coach-browser/", "../../sport-coach-browser/"];
const copies = roots.filter(Boolean).map(r => new URL("src/handoff/", new URL(r as string, import.meta.url))).find(u => existsSync(u));
test("the analyzer's copies are identical", { skip: !copies && "sport-coach-browser/src/handoff not found (set ANALYZER_DIR)" }, () => {
  assert.ok(copies);
  for (const file of ["summary.ts", "handoff.ts"]) {
    assert.equal(readFileSync(new URL(file, copies), "utf8"), readFileSync(new URL("./" + file, import.meta.url), "utf8"), file + " differs: copy shared/" + file + " to sport-coach-browser/src/handoff/");
  }
});
