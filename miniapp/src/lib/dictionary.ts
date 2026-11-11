// Readable names for what a summary carries as ids: exercises, figures (with unit and precision) and findings.
// shared/dictionary.json is generated from the analyzer (scripts/dictionary.mjs).
import data from "../../../shared/dictionary.json" with { type: "json" };
import type { Language } from "../i18n/strings.ts";
import type { Summary } from "../../../shared/summary.ts";
import { SPORT_NAME } from "../../../shared/summary.ts";

type Names = Record<Language, string>;
type Dictionary = {
  exercises: Record<string, Names>;
  scalars: Record<string, { unit: string; digits: number; name: Names }>;
  units: Record<string, Names>;
  findings: Record<string, { title: Names; tone: string }>;
};
const dict = data as unknown as Dictionary;
export type Tone = "attention" | "good" | "info";

/** The exercise as the analyzer named it: the one picked, else the one recognised; null for an unrecognised "auto". */
export function exerciseName(s: Pick<Summary, "s" | "e">, lang: Language): string | null {
  if (s.e === "auto") return null;
  return (dict.exercises[SPORT_NAME[s.s] + "." + s.e] ?? dict.exercises[s.e])?.[lang] ?? null;
}

export const figureName = (id: string, lang: Language) => dict.scalars[id]?.name[lang] ?? id;
export const isCount = (id: string) => dict.scalars[id]?.unit === "count";

/** "−0,35 × торс", "172°", "1,8 с": the analyzer's precision and units, the user's number format. */
export function formatFigure(id: string, value: number, lang: Language): string {
  const meta = dict.scalars[id];
  const number = value.toLocaleString(lang, { maximumFractionDigits: meta?.digits ?? 2, minimumFractionDigits: 0 }).replace("-", "−");
  const unit = meta ? dict.units[meta.unit]?.[lang] ?? "" : "";
  if (!unit) return number;
  return unit === "°" || unit === "%" ? number + unit : number + " " + unit;
}

export const findingTitle = (code: string, lang: Language) => dict.findings[code]?.title[lang] ?? code.replace(/_/g, " ");
export const findingTone = (code: string): Tone => { const t = dict.findings[code]?.tone; return t === "attention" || t === "good" ? t : "info"; };
