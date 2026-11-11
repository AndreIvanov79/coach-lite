import { useMemo, useState } from "react";
import { useLanguage, useT } from "../i18n/index.ts";
import type { Summary } from "../../../shared/summary.ts";
import { SummaryView } from "../components/SummaryView.tsx";
import { Chart } from "../components/Chart.tsx";
import { figureName, isCount } from "../lib/dictionary.ts";
import { series } from "../lib/progress.ts";
import { confirmDialog } from "../lib/telegram.ts";

/** One saved analysis with the progress chart of the chosen figure and "Delete". */
export function Detail({ summary, items, onDelete }: { summary: Summary; items: Summary[]; onDelete: (id: string) => void }) {
  const t = useT(), lang = useLanguage();
  const first = Object.keys(summary.k).find(id => !isCount(id)) ?? null;
  const [figure, setFigure] = useState<string | null>(first);
  const points = useMemo(() => figure ? series(items, summary, figure) : [], [items, summary, figure]);
  return (
    <div className="screen">
      {figure && (
        <section className="card chart-card">
          <h3>{t("chart.title", { figure: figureName(figure, lang) })}</h3>
          {points.length >= 2 ? <Chart figure={figure} points={points} current={summary.id} /> : <p className="hint">{t("chart.needTwo")}</p>}
          <p className="hint mini">{t("chart.tap")}</p>
        </section>
      )}
      <SummaryView summary={summary} selected={figure} onSelect={setFigure} />
      <button className="button button--ghost-danger" onClick={async () => { if (await confirmDialog(t("detail.deleteConfirm"))) onDelete(summary.id); }}>{t("detail.delete")}</button>
    </div>
  );
}
