import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, browserKV, memoryKV } from "./cloud.ts";
import { flatten, loadBatches, planSave, removeSelf, saveSelf, series } from "./progress.ts";
import { exerciseName, figureName, findingTitle, findingTone, formatFigure } from "./dictionary.ts";
import { encodeSummary, decodeSummary, toSummary, type Summary } from "../../../shared/summary.ts";
import { readFileSync } from "node:fs";

const fixtures = JSON.parse(readFileSync(new URL("../../../shared/fixtures/reports.json", import.meta.url), "utf8")) as { name: string; sport: "fitness" | "boxing" | "rg"; exercise: string; duration: number; coverage: number; count: number | null; scalars: [string, number | null][]; findings: { code: string; kind: string; tone: string; focus: boolean }[] }[];
const summary = (i: number, over: Partial<Summary> = {}): Summary => ({
  v: 1, id: "rep-" + i, a: "Ab12", s: "b", e: "bag", t: 29906000 + i * 1440, d: 209, c: 100, n: 20 + i,
  k: { strikes: 20 + i, guardAtStrike: -0.35 + i / 100, extension: 165 + i, punchSpeed: 1180 + i, rotationBest: 50, stanceWidth: 1.64, headMovement: 0.95 },
  f: ["guard_drop", "straight_standing_leg", "head_moves"], ...over
});
const store = async () => { const cloud = memoryKV(); const s = new Store(cloud, browserKV(null)); await s.init(); return { s, cloud }; };

test("summaries are packed into keys of at most 4096 characters, newest first, each once", async () => {
  const { s, cloud } = await store();
  for (let i = 0; i < 30; i++) assert.equal(await saveSelf(s, summary(i)), "saved");
  assert.equal(await saveSelf(s, summary(7)), "exists", "saving the same analysis twice does nothing");
  await s.flush();
  const keys = [...cloud.data.keys()].sort();
  assert.ok(keys.length >= 3, "several keys: " + keys.join());
  for (const k of keys) assert.ok(cloud.data.get(k)!.length <= 4096, k);
  const all = flatten(await loadBatches(s));
  assert.equal(all.length, 30);
  assert.equal(all[0].id, "rep-29");
  assert.ok(all.every(x => x.a === undefined), "no athlete id in My progress");
});

test("a summary can be removed; an empty key is deleted", async () => {
  const { s, cloud } = await store();
  await saveSelf(s, summary(1)); await saveSelf(s, summary(2));
  assert.ok(await removeSelf(s, "rep-1"));
  assert.ok(!(await removeSelf(s, "nope")));
  assert.deepEqual(flatten(await loadBatches(s)).map(x => x.id), ["rep-2"]);
  await removeSelf(s, "rep-2"); await s.flush();
  assert.equal(cloud.data.size, 0);
});

test("broken keys and broken items are skipped, not fatal", async () => {
  const { s, cloud } = await store();
  cloud.data.set("self_1", "{not json"); cloud.data.set("self_2", JSON.stringify({ v: 1, items: [summary(1), { v: 9 }] })); cloud.data.set("profile", "{}");
  assert.deepEqual(flatten(await loadBatches(s)).map(x => x.id), ["rep-1"]);
  assert.equal(planSave(await loadBatches(s), summary(2))!.key, "self_2");
});

test("progress of one figure for the same exercise, oldest first", () => {
  const items = [summary(3), summary(1), summary(2, { e: "mitts" }), summary(4, { k: { strikes: 1 } })];
  assert.deepEqual(series(items, { s: "b", e: "bag" }, "extension").map(p => p.value), [166, 168]);
});

test("every figure and finding a real summary can carry has a readable name", async () => {
  for (const f of fixtures) {
    const s = await decodeSummary((await encodeSummary(toSummary({ id: "x", sport: f.sport, exercise: f.exercise, createdAt: "2026-11-11T10:00:00Z", duration: f.duration, coverage: f.coverage, count: f.count, scalars: f.scalars.map(([id, value]) => ({ id, value })), findings: f.findings }))).param);
    for (const id of Object.keys(s!.k)) for (const lang of ["ru", "en", "ro"] as const) assert.notEqual(figureName(id, lang), id, f.name + " " + id);
    for (const code of s!.f) for (const lang of ["ru", "en", "ro"] as const) assert.doesNotMatch(findingTitle(code, lang), /_|\{/, f.name + " " + code);
  }
  assert.equal(formatFigure("guardAtStrike", -0.35, "ru"), "−0,35 × торс");
  assert.equal(formatFigure("extension", 172, "en"), "172°");
  assert.equal(formatFigure("strikes", 24, "ro"), "24");
  assert.equal(findingTitle("guard_drop", "en"), "Rear hand drops while striking");
  assert.equal(findingTone("guard_drop"), "attention");
  assert.equal(exerciseName({ s: "b", e: "bag" }, "ru"), "Работа на мешке");
  assert.equal(exerciseName({ s: "f", e: "squat" }, "en"), "Squats", "the picked exercise wins over the recognised one");
  assert.equal(exerciseName({ s: "b", e: "auto" }, "en"), null);
});
