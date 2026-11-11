import { useT } from "../i18n/index.ts";
import { BOT } from "../lib/telegram.ts";

/** Opened in a plain browser: the data lives in the user's Telegram cloud, so there is nothing to show here. */
export function Outside() {
  const t = useT();
  return (
    <div className="screen screen--center">
      <div className="logo" aria-hidden="true">CD</div>
      <h1>{t("outside.title")}</h1>
      <p className="hint narrow">{t("outside.text")}</p>
      <a className="button" href={"https://t.me/" + BOT + "?startapp"}>{t("outside.open")}</a>
    </div>
  );
}
