import { createContext, useContext } from "react";
import { translate, type Language, type StringKey } from "./strings.ts";

export const LanguageContext = createContext<Language>("en");
export type Translate = (key: StringKey, params?: Record<string, string | number>) => string;

export function useT(): Translate {
  const lang = useContext(LanguageContext);
  return (key, params) => translate(lang, key, params);
}
export const useLanguage = () => useContext(LanguageContext);
export { LANGUAGES, resolveLanguage, type Language, type StringKey } from "./strings.ts";
