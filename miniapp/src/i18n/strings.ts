// Languages and lookup without React (also used by tests). RU is the base set; EN and RO must have the same keys.
import { ru, type StringKey } from "./ru.ts";
import { en } from "./en.ts";
import { ro } from "./ro.ts";

export const LANGUAGES = ["ru", "en", "ro"] as const;
export type Language = (typeof LANGUAGES)[number];
export const BUNDLES: Record<Language, Record<StringKey, string>> = { ru, en, ro };
export const FALLBACK: Language = "en";
export type { StringKey };

/** Telegram sends codes like "ru-RU"; old Romanian clients may send "mo". */
export function resolveLanguage(...candidates: (string | null | undefined)[]): Language {
  for (const c of candidates) {
    if (!c) continue;
    let code = c.trim().toLowerCase().replace("_", "-").split("-")[0];
    if (code === "mo") code = "ro";
    if ((LANGUAGES as readonly string[]).includes(code)) return code as Language;
  }
  return FALLBACK;
}

export function translate(lang: Language, key: StringKey, params?: Record<string, string | number>): string {
  const raw = BUNDLES[lang][key] ?? BUNDLES.en[key] ?? key;
  return params ? raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : raw;
}
