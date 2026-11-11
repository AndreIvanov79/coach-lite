import { useT } from "../i18n/index.ts";
import { analyzerUrl, openLinkOptions, type Sport } from "../../../shared/handoff.ts";
import { BOT, haptic, openExternal, platform } from "../lib/telegram.ts";

const SPORTS: { id: Sport; icon: string }[] = [{ id: "fitness", icon: "🏋️" }, { id: "boxing", icon: "🥊" }, { id: "rg", icon: "🤸" }];

/** Opens the analyzer in the phone's browser for Self-training (no athlete); the summary comes back via startapp. */
export function SportPick() {
  const t = useT();
  const open = (sport: Sport) => { haptic(); openExternal(analyzerUrl(sport, { ret: { bot: BOT } }), openLinkOptions(platform())); };
  return (
    <div className="screen">
      <h1>{t("home.pickSport")}</h1>
      <div className="list">
        {SPORTS.map(s => (
          <button key={s.id} className="row" onClick={() => open(s.id)}>
            <span className="row__icon" aria-hidden="true">{s.icon}</span>
            <span className="row__title">{t(("sport." + s.id) as "sport.fitness")}</span>
            <span className="row__chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <p className="hint">{t("home.analyzerNote")}</p>
    </div>
  );
}
