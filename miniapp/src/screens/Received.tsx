import { useState } from "react";
import { useT } from "../i18n/index.ts";
import type { Summary } from "../../../shared/summary.ts";
import { SummaryView } from "../components/SummaryView.tsx";

export type SaveResult = "saved" | "exists" | "full";

/** A summary that came back from the analyzer: preview first, saved only after the tap (SPEC 6.4). */
export function Received({ summary, saved, onSave, onOpen, onDone }: {
  summary: Summary | null; saved: boolean; onSave: (s: Summary) => Promise<SaveResult>; onOpen: (id: string) => void; onDone: () => void;
}) {
  const t = useT();
  const [own, setState] = useState<"idle" | "saving" | SaveResult>("idle");
  // `saved` may turn true a moment later, once "My progress" has loaded.
  const state = own === "idle" && saved ? "exists" : own;
  if (!summary) return (
    <div className="screen">
      <h1>{t("received.title")}</h1>
      <div className="card"><p className="error">{t("received.bad")}</p></div>
      <div className="spacer" />
      <button className="button button--wide" onClick={onDone}>{t("received.done")}</button>
    </div>
  );
  const forAthlete = !!summary.a;
  const save = async () => { setState("saving"); setState(await onSave(summary)); };
  return (
    <div className="screen">
      <h1>{t("received.title")}</h1>
      <span className="badge">{t(forAthlete ? "received.forAthlete" : "received.forSelf")}</span>
      <SummaryView summary={summary} />
      {forAthlete && <p className="hint">{t("received.athleteSoon")}</p>}
      {state === "exists" && <p className="hint">{t("received.exists")}</p>}
      {state === "full" && <p className="error">{t("received.full")}</p>}
      <div className="spacer" />
      {forAthlete ? <button className="button button--wide" onClick={onDone}>{t("received.done")}</button>
        : state === "saved" || state === "exists" ? <button className="button button--wide" onClick={() => onOpen(summary.id)}>{t("received.open")}</button>
        : <button className="button button--wide" disabled={state === "saving"} onClick={() => void save()}>{t("received.save")}</button>}
    </div>
  );
}
