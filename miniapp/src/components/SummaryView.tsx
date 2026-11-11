import { useLanguage, useT } from "../i18n/index.ts";
import { SPORT_NAME, type Summary } from "../../../shared/summary.ts";
import { exerciseName, figureName, findingTitle, findingTone, formatFigure, isCount } from "../lib/dictionary.ts";

export function summaryTitle(s: Summary, lang: ReturnType<typeof useLanguage>, t: ReturnType<typeof useT>): string {
  return exerciseName(s, lang) ?? t(("sport." + SPORT_NAME[s.s]) as "sport.fitness");
}
export const summaryDate = (s: Summary, lang: string, withTime = true) =>
  new Date(s.t * 60000).toLocaleString(lang, withTime ? { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });

/** One analysis: what, when, the count, every figure (tap to chart it) and the findings. */
export function SummaryView({ summary, selected, onSelect }: { summary: Summary; selected?: string | null; onSelect?: (figure: string) => void }) {
  const t = useT(), lang = useLanguage();
  const figures = Object.entries(summary.k);
  const exercise = exerciseName(summary, lang);
  return (
    <>
      <div className="card summary">
        <span className="hint">{t(("sport." + SPORT_NAME[summary.s]) as "sport.fitness")}</span>
        <h2>{exercise ?? t(("sport." + SPORT_NAME[summary.s]) as "sport.fitness")}</h2>
        <p className="hint">{summaryDate(summary, lang)} · {(summary.d / 10).toLocaleString(lang, { maximumFractionDigits: 1 })} {t("unit.seconds")} · {t("summary.coverage", { c: summary.c })}</p>
        {summary.n !== null && <p className="summary__count">{t(("received.count." + summary.s) as "received.count.f", { n: summary.n })}</p>}
      </div>
      {summary.f.length > 0 ? (
        <section className="group">
          <h3>{t("summary.findings")}</h3>
          <ul className="findings">
            {summary.f.map(code => <li key={code} className={"finding finding--" + findingTone(code)}><span className="dot" aria-hidden="true" />{findingTitle(code, lang)}</li>)}
          </ul>
        </section>
      ) : <p className="hint">{t("summary.noFindings")}</p>}
      {figures.length > 0 && (
        <section className="group">
          <h3>{t("summary.figures")}</h3>
          <div className="list">
            {figures.map(([id, value]) => {
              const chartable = onSelect && !isCount(id);
              return (
                <button key={id} className={"row figure" + (selected === id ? " figure--on" : "")} disabled={!chartable} onClick={() => chartable && onSelect!(id)} aria-pressed={selected === id}>
                  <span className="row__title">{figureName(id, lang)}</span>
                  <span className="figure__value">{formatFigure(id, value, lang)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
