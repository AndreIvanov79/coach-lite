import { useLanguage } from "../i18n/index.ts";
import { formatFigure } from "../lib/dictionary.ts";

/** A small line chart of one figure over time; the current analysis is the larger dot. */
export function Chart({ figure, points, current }: { figure: string; points: { t: number; value: number; id: string }[]; current: string }) {
  const lang = useLanguage();
  const W = 320, H = 150, L = 8, R = 8, T = 22, B = 24;
  const values = points.map(p => p.value);
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const t0 = points[0].t, t1 = points.at(-1)!.t;
  const x = (t: number, i: number) => L + (t1 > t0 ? (t - t0) / (t1 - t0) : i / Math.max(1, points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => (i ? "L" : "M") + x(p.t, i).toFixed(1) + " " + y(p.value).toFixed(1)).join(" ");
  const date = (t: number) => new Date(t * 60000).toLocaleDateString(lang, { day: "numeric", month: "short" });
  const max = Math.max(...values), min = Math.min(...values);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={figure}>
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="chart__axis" />
      <text x={L} y={12} className="chart__label">{formatFigure(figure, max, lang)}</text>
      <text x={W - R} y={12} className="chart__label" textAnchor="end">min {formatFigure(figure, min, lang)}</text>
      <path d={path} className="chart__line" />
      {points.map((p, i) => <circle key={p.id} cx={x(p.t, i)} cy={y(p.value)} r={p.id === current ? 5.5 : 3.5} className={p.id === current ? "chart__dot chart__dot--on" : "chart__dot"} />)}
      <text x={L} y={H - 6} className="chart__label">{date(t0)}</text>
      <text x={W - R} y={H - 6} className="chart__label" textAnchor="end">{date(t1)}</text>
    </svg>
  );
}
