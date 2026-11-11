// Builds shared/dictionary.json from the analyzer (sport-coach-browser): names of exercises, figures and findings in
// RU/EN/RO, units and display precision of figures, tone of findings. The Mini App shows summaries with it; the summary
// itself carries only ids and numbers (SPEC 6.2, 11.1). Run again when the analyzer gains figures or findings.
// Usage: node scripts/dictionary.mjs [--analyzer ../../sport-coach-browser]
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const root = path.resolve(arg("analyzer", process.env.ANALYZER_DIR ?? "../../sport-coach-browser"));
const LANGS = ["ru", "en", "ro"];
const dict = {};
for (const lang of LANGS) dict[lang] = (await import(pathToFileURL(path.join(root, "src/i18n", lang + ".ts")).href))[lang];

async function sources(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "i18n") out.push(...await sources(p)); }
    else if (p.endsWith(".ts")) out.push(await fs.readFile(p, "utf8"));
  }
  return out;
}
const code = (await sources(path.join(root, "src"))).join("\n");
const pick = key => Object.fromEntries(LANGS.map(l => [l, dict[l][key] ?? dict.en[key]]));

// Figures: scalar("id", value, "unit", digits)
const scalars = {};
for (const m of code.matchAll(/scalar\("([A-Za-z]+)",[^;]*?,\s*"([a-z]+)"(?:,\s*(\d))?/g)) {
  const [, id, unit, digits] = m;
  if (scalars[id] || !dict.en["s." + id]) continue;
  scalars[id] = { unit, digits: digits === undefined ? 1 : Number(digits), name: pick("s." + id) };
}
const units = {};
for (const u of new Set(Object.values(scalars).map(s => s.unit))) units[u] = pick("u." + u);

// Exercises: the one picked (ex.<sport>.<id>) or recognised (exn.<id>).
const exercises = {};
for (const key of Object.keys(dict.en)) {
  const m = key.match(/^ex\.(fitness|boxing|rg)\.([a-z_]+)$/) ?? key.match(/^exn\.([a-z_]+)$/);
  if (m) exercises[key.startsWith("exn.") ? m[1] : m[1] + "." + m[2]] = pick(key);
}

// Findings: title in three languages and tone. Titles with {placeholders} get a generic title here,
// because a summary carries the code without its numbers.
const GENERIC = {
  hold: ["Удержание позы", "Hold", "Menținere"],
  rg_split_small: ["Шпагат: малый недотяг", "Split: slightly short", "Sfoară: abatere mică"],
  rg_split_medium: ["Шпагат: средний недотяг", "Split: moderately short", "Sfoară: abatere medie"],
  rg_split_large: ["Шпагат: большой недотяг", "Split: well short", "Sfoară: abatere mare"],
  rg_balance_short: ["Равновесие меньше 1 с", "Balance held under 1 s", "Echilibru sub 1 s"],
  rg_balance_held: ["Равновесие зафиксировано", "Balance fixed", "Echilibru fixat"],
  rg_rotation: ["Вращения", "Rotations", "Rotiri"],
  rg_static: ["Статичная гимнастка", "Static gymnast", "Gimnastă statică"],
  rg_missing_group: ["Нет трудностей одной из групп", "A difficulty group is missing", "Lipsește o grupă de dificultăți"],
  rg_max_split: ["Максимальное раскрытие ног", "Maximum leg opening", "Deschidere maximă"]
};
const tones = {};
for (const m of code.matchAll(/systematicFault\("([a-z0-9_]+)"/g)) tones[m[1]] = "attention";
for (const m of code.matchAll(/consistentStrength\("([a-z0-9_]+)"/g)) tones[m[1]] = "good";
for (const m of code.matchAll(/code:\s*["']([a-z0-9_]+)["'],\s*tone:\s*["']([a-z]+)["']/g)) tones[m[1]] ??= m[2];
// Tone chosen at run time in the analyzer (by size of the deviation): fixed here for the summary.
Object.assign(tones, { rg_split_small: "attention", rg_split_medium: "attention", rg_split_large: "attention", rg_balance_short: "attention" }, { ...tones });
const findings = {}, unnamed = [];
for (const key of Object.keys(dict.en)) {
  const m = key.match(/^f\.([a-z0-9_]+)\.t$/);
  if (!m) continue;
  const c = m[1];
  const title = GENERIC[c] ? Object.fromEntries(LANGS.map((l, i) => [l, GENERIC[c][i]])) : pick(key);
  if (Object.values(title).some(t => /\{\w+\}/.test(t))) { unnamed.push(c); continue; } // counts and meta: never in a summary
  findings[c] = { title, tone: tones[c] ?? "info" };
}

const out = { source: "sport-coach-browser", exercises, scalars, units, findings };
await fs.writeFile(new URL("../shared/dictionary.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`shared/dictionary.json: ${Object.keys(exercises).length} exercises, ${Object.keys(scalars).length} figures, ${Object.keys(findings).length} findings` +
  (unnamed.length ? `; left out (titles need numbers): ${unnamed.join(", ")}` : ""));
const noTone = Object.keys(findings).filter(c => !tones[c]);
if (noTone.length) console.log("findings without a known tone (shown as info): " + noTone.join(", "));
