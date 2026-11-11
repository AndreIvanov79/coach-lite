import { useEffect, useState } from "react";
import { LANGUAGES, useLanguage, useT, type Language } from "../i18n/index.ts";
import { LIMITS, type Store, type StoreState } from "../lib/cloud.ts";
import type { Mode, Profile } from "../lib/profile.ts";
import { openExternal } from "../lib/telegram.ts";
import { VERSION } from "../version.ts";
import { documentUrl } from "./Consent.tsx";

const LANGUAGE_NAMES: Record<Language, string> = { ru: "Русский", en: "English", ro: "Română" };

export function Settings({ store, profile, sync, onChange }: { store: Store; profile: Profile; sync: StoreState; onChange: (p: Profile) => void }) {
  const t = useT(), lang = useLanguage();
  const [keys, setKeys] = useState<number | null>(null);
  useEffect(() => { store.keys().then(k => setKeys(k.length), () => setKeys(null)); }, [store, sync.pending]);
  const accepted = profile.accepted ? new Date(profile.accepted.at).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div className="screen">
      <h1>{t("settings.title")}</h1>
      <section className="group">
        <h3>{t("settings.language")}</h3>
        <div className="segmented" role="radiogroup">
          {LANGUAGES.map(l => <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""} onClick={() => onChange({ ...profile, lang: l })}>{LANGUAGE_NAMES[l]}</button>)}
        </div>
      </section>
      <section className="group">
        <h3>{t("settings.mode")}</h3>
        <div className="segmented" role="radiogroup">
          {(["self", "coach"] as Mode[]).map(m => <button key={m} role="radio" aria-checked={profile.mode === m} className={profile.mode === m ? "on" : ""} onClick={() => onChange({ ...profile, mode: m })}>{t(m === "self" ? "mode.self" : "mode.coach")}</button>)}
        </div>
      </section>
      <section className="group">
        <h3>{t("settings.documents")}</h3>
        <div className="list">
          <button className="row" onClick={() => openExternal(documentUrl("terms", lang))}><span className="row__title">{t("consent.terms")}</span><span className="row__chevron">↗</span></button>
          <button className="row" onClick={() => openExternal(documentUrl("privacy", lang))}><span className="row__title">{t("consent.privacy")}</span><span className="row__chevron">↗</span></button>
        </div>
        {accepted && <p className="hint">{t("settings.accepted", { date: accepted })}</p>}
      </section>
      <section className="group">
        <p className="hint">{sync.pending ? t("settings.pending", { n: sync.pending }) : t("settings.synced")}</p>
        {keys !== null && <p className="hint">{t("settings.storage", { keys, max: LIMITS.keys })}</p>}
        <p className="hint">{t("settings.about", { version: VERSION })}</p>
      </section>
    </div>
  );
}
