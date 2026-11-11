import { useT } from "../i18n/index.ts";
import type { Mode } from "../lib/profile.ts";
import { haptic } from "../lib/telegram.ts";

export function ModeSelect({ current, onPick }: { current?: Mode; onPick: (mode: Mode) => void }) {
  const t = useT();
  const pick = (mode: Mode) => { haptic(); onPick(mode); };
  return (
    <div className="screen">
      <h1>{t("mode.title")}</h1>
      <div className="mode-list">
        {(["self", "coach"] as const).map(mode => (
          <button key={mode} className={"mode-card" + (current === mode ? " mode-card--current" : "")} onClick={() => pick(mode)} aria-pressed={current === mode}>
            <span className="mode-card__icon" aria-hidden="true">{mode === "self" ? "🏃" : "📋"}</span>
            <span className="mode-card__text">
              <span className="mode-card__title">{t(mode === "self" ? "mode.self" : "mode.coach")}</span>
              <span className="hint">{t(mode === "self" ? "mode.self.hint" : "mode.coach.hint")}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
