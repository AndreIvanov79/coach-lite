import { useLanguage, useT } from "../i18n/index.ts";
import type { Mode } from "../lib/profile.ts";
import type { Summary } from "../../../shared/summary.ts";
import { figureName, findingTone, formatFigure, isCount } from "../lib/dictionary.ts";
import { summaryDate, summaryTitle } from "../components/SummaryView.tsx";

export function Home({ mode, items, onNewAnalysis, onOpen }: { mode: Mode; items: Summary[] | null; onNewAnalysis: () => void; onOpen: (id: string) => void }) {
  const t = useT(), lang = useLanguage();
  if (mode === "coach") return (
    <div className="screen">
      <h1>{t("home.coach.title")}</h1>
      <div className="card empty">
        <span className="badge">{t("home.soon")}</span>
        <p className="hint">{t("home.coach.empty")}</p>
      </div>
    </div>
  );
  return (
    <div className="screen">
      <h1>{t("home.self.title")}</h1>
      {items === null ? <p className="hint">{t("app.loading")}</p>
        : items.length === 0 ? <div className="card empty"><p className="hint">{t("home.self.empty")}</p></div>
        : (
          <>
            <p className="hint">{t("home.total", { n: items.length })}</p>
            <div className="list">
              {items.map(s => {
                const top = Object.entries(s.k).filter(([id]) => !isCount(id)).slice(0, 2);
                const tone = s.f.map(findingTone).includes("attention") ? "attention" : s.f.length ? findingTone(s.f[0]) : "info";
                return (
                  <button key={s.id} className="row item" onClick={() => onOpen(s.id)}>
                    <span className={"dot dot--" + tone} aria-hidden="true" />
                    <span className="item__body">
                      <span className="row__title">{summaryTitle(s, lang, t)}{s.n !== null ? " · " + s.n : ""}</span>
                      <span className="hint item__meta">{summaryDate(s, lang, false)}{top.map(([id, v]) => " · " + figureName(id, lang) + " " + formatFigure(id, v, lang)).join("")}</span>
                    </span>
                    <span className="row__chevron" aria-hidden="true">›</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      <div className="spacer" />
      <button className="button button--wide sticky" onClick={onNewAnalysis}>{t("home.newAnalysis")}</button>
    </div>
  );
}
