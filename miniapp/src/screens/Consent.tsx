import { useT } from "../i18n/index.ts";
import { openExternal } from "../lib/telegram.ts";

export const documentUrl = (name: "terms" | "privacy", lang: string) => new URL(name + ".html#" + lang, location.href).href;

/** The only step before using the app (SPEC 10.4): one screen, one button. */
export function Consent({ onAccept }: { onAccept: () => void }) {
  const t = useT();
  const lang = document.documentElement.lang || "en";
  return (
    <div className="screen">
      <div className="logo" aria-hidden="true">CD</div>
      <h1>{t("consent.title")}</h1>
      <div className="card prose">
        <p>{t("consent.p1")}</p>
        <p>{t("consent.p2")}</p>
        <p className="links">
          <button className="link" onClick={() => openExternal(documentUrl("terms", lang))}>{t("consent.terms")}</button>
          <button className="link" onClick={() => openExternal(documentUrl("privacy", lang))}>{t("consent.privacy")}</button>
        </p>
      </div>
      <div className="spacer" />
      <button className="button button--wide" onClick={onAccept}>{t("consent.accept")}</button>
    </div>
  );
}
