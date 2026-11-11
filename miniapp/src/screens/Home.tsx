import { useT } from "../i18n/index.ts";
import type { Mode } from "../lib/profile.ts";

export function Home({ mode, onNewAnalysis }: { mode: Mode; onNewAnalysis: () => void }) {
  const t = useT();
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
      <div className="card empty"><p className="hint">{t("home.self.empty")}</p></div>
      <div className="spacer" />
      <button className="button button--wide" onClick={onNewAnalysis}>{t("home.newAnalysis")}</button>
    </div>
  );
}
