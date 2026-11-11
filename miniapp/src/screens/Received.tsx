import { useLanguage, useT } from "../i18n/index.ts";
import { SPORT_NAME, type Summary } from "../../../shared/summary.ts";

/** Preview of a summary that came back from the analyzer. Saving it to a card comes with step 5 (SPEC 6.4). */
export function Received({ summary, onDone }: { summary: Summary | null; onDone: () => void }) {
  const t = useT(), lang = useLanguage();
  if (!summary) return (
    <div className="screen">
      <h1>{t("received.title")}</h1>
      <div className="card"><p className="error">{t("received.bad")}</p></div>
      <div className="spacer" />
      <button className="button button--wide" onClick={onDone}>{t("received.done")}</button>
    </div>
  );
  const date = new Date(summary.t * 60000).toLocaleString(lang, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="screen">
      <h1>{t("received.title")}</h1>
      <div className="card summary">
        <span className="badge">{t(summary.a ? "received.forAthlete" : "received.forSelf")}</span>
        <h2>{t(("sport." + SPORT_NAME[summary.s]) as "sport.fitness")}</h2>
        <p className="hint">{date} · {(summary.d / 10).toLocaleString(lang, { maximumFractionDigits: 1 })} {t("unit.seconds")}</p>
        {summary.n !== null && <p className="summary__count">{t(("received.count." + summary.s) as "received.count.f", { n: summary.n })}</p>}
        <p className="hint">{t("received.details", { k: Object.keys(summary.k).length, f: summary.f.length, c: summary.c })}</p>
      </div>
      <p className="hint">{t("received.saveSoon")}</p>
      <div className="spacer" />
      <button className="button button--wide" onClick={onDone}>{t("received.done")}</button>
    </div>
  );
}
