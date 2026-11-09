import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { toSummary, encodeSummary, decodeSummary, validateSummary, roundValue, isSummaryParam, PARAM_MAX, type Summary, type SummarySource, type Sport } from "./summary.ts";

/** Real analyses: sport-coach-browser e2e fixtures and two user boxing clips (shared/fixtures/README.md). */
type Fixture = {
  name: string; sport: Sport; exercise: string; detected: string | null; duration: number; coverage: number; count: number | null;
  scalars: [string, number | null][]; findings: { code: string; kind: string | null; tone: string; focus: boolean }[];
};
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL("./fixtures/reports.json", import.meta.url), "utf8"));
const UUID = "3f2a9c4e-8b1d-4e6f-9a2b-7c5d1e0f4a6b";
const source = (f: Fixture, id = UUID): SummarySource => ({
  id, sport: f.sport, exercise: f.exercise, detected: f.detected, createdAt: "2026-11-09T18:42:10Z",
  duration: f.duration, coverage: f.coverage, count: f.count,
  scalars: f.scalars.map(([sid, value]) => ({ id: sid, value })),
  findings: f.findings.map(x => ({ code: x.code, tone: x.tone, focus: x.focus, ...(x.kind ? { kind: x.kind } : {}) }))
});
const b64 = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString("base64url");
const r0 = (value: unknown) => "r0_" + b64(Buffer.from(JSON.stringify(value)));
const r1 = (text: string) => "r1_" + b64(deflateRawSync(Buffer.from(text)));
const valid: Summary = { v: 1, id: "rep1", s: "f", e: "squat", t: 29903751, d: 431, c: 87, n: 12, k: { reps: 12, trunkLean: 18 }, f: ["hip_sag"] };

test("fixtures cover all three sports", () => {
  assert.deepEqual([...new Set(fixtures.map(f => f.sport))].sort(), ["boxing", "fitness", "rg"]);
});

for (const f of fixtures) {
  test("real report fits whole and survives the trip: " + f.name, async t => {
    const summary = toSummary(source(f), { athlete: "Ab12Cd34", inbox: "x7Yq" });
    const packed = await encodeSummary(summary);
    const plain = await encodeSummary(summary, { compress: false });
    t.diagnostic(`${f.sport}/${summary.e}: ${Object.keys(summary.k).length} figures, ${summary.f.length} findings; r1 ${packed.param.length} chars, r0 ${plain.param.length} chars`);
    assert.ok(packed.param.length <= PARAM_MAX);
    assert.deepEqual(packed.dropped, { k: [], f: [] }, "nothing dropped");
    assert.match(packed.param, /^r1_[A-Za-z0-9_-]+$/);
    assert.deepEqual(await decodeSummary(packed.param), summary);
    if (plain.param.length <= PARAM_MAX) assert.deepEqual(await decodeSummary(plain.param), plain.summary);
    // Nothing that names the athlete or the file, no landmarks.
    const json = JSON.stringify(summary);
    assert.doesNotMatch(json, /\.(webm|mp4|mov)|landmark|fileName|"x":/i);
  });
}

test("toSummary keeps the order of figures, skips unassessable ones and rounds", () => {
  const s = toSummary({
    id: "r", sport: "fitness", exercise: "squat", createdAt: Date.UTC(2026, 10, 9, 18, 42, 59), duration: 43.14, coverage: 0.8749, count: 12,
    scalars: [{ id: "reps", value: 12 }, { id: "gone", value: null }, { id: "trunkLean", value: 18.46 }, { id: "cycleTime", value: 2.3456 },
      { id: "precise", value: 1.23456, digits: 1 }, { id: "nan", value: NaN }, { id: "neg", value: -0.001 }, { id: "bad id", value: 1 }, { id: "reps", value: 99 }],
    findings: []
  });
  assert.deepEqual(Object.entries(s.k), [["reps", 12], ["trunkLean", 18], ["cycleTime", 2.35], ["precise", 1.2], ["neg", 0]]);
  assert.equal(s.t, Math.floor(Date.UTC(2026, 10, 9, 18, 42) / 60000));
  assert.equal(s.d, 431);
  assert.equal(s.c, 87);
  assert.equal(s.n, 12);
  assert.equal(roundValue(-0.004), 0);
  assert.ok(!Object.is(roundValue(-0.004), -0));
});

test("toSummary puts the focus first, then faults, then strengths", () => {
  const s = toSummary({
    id: "r", sport: "boxing", exercise: "auto", detected: "bag", createdAt: "2026-11-09T10:00:00Z", duration: 10, coverage: 1, count: null, scalars: [],
    findings: [
      { code: "coverage_ok", kind: "quality", tone: "good" }, { code: "strikes", kind: "info", tone: "info" },
      { code: "fast_full_punches", kind: "strength", tone: "good" }, { code: "head_moves", tone: "attention" },
      { code: "guard_drop", kind: "fault", tone: "attention", focus: true }, { code: "head_moves", kind: "fault", tone: "attention" },
      { code: "late_strength", kind: "strength", tone: "good" }
    ]
  });
  assert.deepEqual(s.f, ["guard_drop", "head_moves", "fast_full_punches"]);
  assert.equal(s.e, "bag", "auto is replaced by the detected mode");
  assert.equal(s.n, null);
  assert.equal(s.s, "b");
});

test("technique remarks fill the places left, counts and quality notes do not", () => {
  const s = toSummary({
    id: "r", sport: "rg", exercise: "auto", createdAt: 0, duration: 15, coverage: 0.89, count: 1, scalars: [],
    findings: [{ code: "rg_events", kind: "info", tone: "info" }, { code: "rg_rotation", tone: "info" }, { code: "view_oblique", kind: "quality", tone: "info" },
      { code: "rg_max_split", kind: "info", tone: "info" }, { code: "exercise_ambiguous", kind: "info", tone: "info" }, { code: "rg_static", kind: "fault", tone: "attention" }]
  });
  assert.deepEqual(s.f, ["rg_static", "rg_rotation", "rg_max_split"]);
});

test("toSummary refuses ids that cannot travel", () => {
  const base: SummarySource = { id: "ok", sport: "rg", exercise: "element", createdAt: 0, duration: 1, coverage: 1, count: 1, scalars: [], findings: [] };
  assert.throws(() => toSummary({ ...base, id: "has space" }));
  assert.throws(() => toSummary(base, { athlete: "x".repeat(41) }));
  assert.throws(() => toSummary({ ...base, sport: "chess" as Sport }));
});

test("too long: figures go from the end of the priority list, then findings", async () => {
  const k: Record<string, number> = {};
  for (let i = 0; i < 60; i++) k["figure" + String(i).padStart(2, "0") + "_" + "abcdefghijklmnop".slice(i % 7)] = 1000 + i * 37.5;
  const big: Summary = { ...valid, id: UUID, a: "A".repeat(40), in: "B".repeat(40), k, f: ["first_finding", "second_finding", "third_finding"] };
  const out = await encodeSummary(big);
  assert.ok(out.param.length <= PARAM_MAX);
  const kept = Object.keys(out.summary.k);
  assert.ok(kept.length > 0 && kept.length < 60);
  assert.deepEqual(kept, Object.keys(k).slice(0, kept.length), "the most important figures stay");
  assert.deepEqual(out.dropped.k, Object.keys(k).slice(kept.length));
  assert.deepEqual(out.dropped.f, [], "findings stay while figures can go");
  assert.deepEqual(await decodeSummary(out.param), out.summary);
  assert.equal(Object.keys(big.k).length, 60, "the input is not changed");

  const noisy: Summary = { ...valid, id: "y".repeat(40), a: "A".repeat(40), in: "B".repeat(40), e: "e".repeat(40), k: {}, f: ["a".repeat(40), "b".repeat(40), "c".repeat(40)] };
  const plain = await encodeSummary(noisy, { compress: false });
  assert.ok(plain.param.length <= PARAM_MAX);
  assert.deepEqual(plain.dropped, { k: [], f: ["c".repeat(40)] }, "with no figures left, the last finding goes");
  assert.deepEqual(await decodeSummary(plain.param), plain.summary);
});

test("without CompressionStream the plain form is used", async () => {
  const out = await encodeSummary(valid, { compress: false });
  assert.match(out.param, /^r0_/);
  assert.deepEqual(await decodeSummary(out.param), valid);
  assert.ok(isSummaryParam(out.param));
  assert.ok(!isSummaryParam("inv_abc"));
});

test("the compressed form is chosen only when shorter", async () => {
  const tiny: Summary = { ...valid, k: {}, f: [] };
  const out = await encodeSummary(tiny);
  const plain = await encodeSummary(tiny, { compress: false });
  assert.ok(out.param.length <= plain.param.length);
});

test("decoder rejects anything that is not a summary", async () => {
  const bad: unknown[] = [
    undefined, null, 42, "", "r1_", "r2_abc", "inv_abc", "r0_a", "r0_!!!!", "r0_" + "A".repeat(PARAM_MAX),
    r0("not an object"), r0([valid]), "r0_" + b64(Buffer.from("{not json")),
    "r0_" + b64(Buffer.from([0x7b, 0xff, 0xfe, 0x7d])),            // not UTF-8
    "r1_" + b64(Buffer.from("definitely not deflate data ...")),
    r1("{\"v\":1"),                                                // truncated JSON
    r0({ ...valid, v: 2 }), r0({ ...valid, s: "x" }), r0({ ...valid, id: "" }), r0({ ...valid, id: "a b" }),
    r0({ ...valid, a: "../../x" }), r0({ ...valid, in: 5 }), r0({ ...valid, e: "Squat!" }),
    r0({ ...valid, t: 1 }), r0({ ...valid, t: 1e12 }), r0({ ...valid, d: -1 }), r0({ ...valid, d: 1.5 }), r0({ ...valid, c: 101 }),
    r0({ ...valid, n: -3 }), r0({ ...valid, n: "12" }), r0({ ...valid, k: [] }), r0({ ...valid, k: { reps: "12" } }),
    r0({ ...valid, k: { "bad key": 1 } }), r0({ ...valid, k: { reps: 1e9 } }), r0({ ...valid, f: "hip_sag" }),
    r0({ ...valid, f: ["a", "b", "c", "d"] }), r0({ ...valid, f: ["<script>"] })
  ];
  for (const param of bad) assert.equal(await decodeSummary(param), null, String(param).slice(0, 60));
});

test("decoder drops unknown fields and duplicate findings", async () => {
  const got = await decodeSummary(r0({ ...valid, f: ["hip_sag", "hip_sag"], fileName: "IMG_0001.mp4", name: "Иван", extra: { deep: 1 } }));
  assert.deepEqual(got, { ...valid, f: ["hip_sag"] });
  assert.equal(validateSummary({ ...valid, k: Object.fromEntries(Array.from({ length: 61 }, (_, i) => ["k" + i, i])) }), null);
});

test("decoder stops inflating a zip bomb", async () => {
  const bomb = "{\"v\":1,\"id\":\"" + "a".repeat(300000) + "\"}";
  const param = r1(bomb);
  assert.ok(param.length <= PARAM_MAX, "the bomb fits into a start parameter: " + param.length);
  assert.equal(await decodeSummary(param), null);
});
