import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageContext, resolveLanguage, useT, type Language } from "./i18n/index.ts";
import { translate } from "./i18n/strings.ts";
import { StoreError, type Store, type StoreState } from "./lib/cloud.ts";
import { flatten, loadBatches, removeSelf, saveSelf } from "./lib/progress.ts";
import { PROFILE_KEY, accept, needsConsent, parseProfile, type Mode, type Profile } from "./lib/profile.ts";
import { OldTelegramError, openStore } from "./lib/session.ts";
import { backButton, haptic, inTelegram, initTelegram, onThemeChange, startParam, tgUser, webApp } from "./lib/telegram.ts";
import { decodeSummary, isSummaryParam, type Summary } from "../../shared/summary.ts";
import { Consent } from "./screens/Consent.tsx";
import { Detail } from "./screens/Detail.tsx";
import { Home } from "./screens/Home.tsx";
import { ModeSelect } from "./screens/ModeSelect.tsx";
import { Outside } from "./screens/Outside.tsx";
import { Received, type SaveResult } from "./screens/Received.tsx";
import { Settings } from "./screens/Settings.tsx";
import { SportPick } from "./screens/SportPick.tsx";

type Boot =
  | { kind: "loading" }
  | { kind: "outside" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "ready"; store: Store };

/** A stack of screens; "back" is Telegram's BackButton (SPEC 9). */
type Screen =
  | { name: "consent" }
  | { name: "mode" }
  | { name: "home" }
  | { name: "sport" }
  | { name: "settings" }
  | { name: "received"; summary: Summary | null }
  | { name: "detail"; id: string };

const deviceLanguage = () => resolveLanguage(tgUser()?.language_code, typeof navigator === "undefined" ? null : navigator.language);

export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: "loading" });
  const [profile, setProfile] = useState<Profile>({ v: 1 });
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [received, setReceived] = useState<Summary | null | undefined>(undefined);
  const [sync, setSync] = useState<StoreState>({ pending: 0, error: null });
  const [items, setItems] = useState<Summary[] | null>(null);
  const lang: Language = profile.lang ?? deviceLanguage();

  const start = useCallback(async () => {
    setBoot({ kind: "loading" });
    initTelegram();
    if (!inTelegram()) { setBoot({ kind: "outside" }); return; }
    try {
      const store = await openStore();
      const loaded = parseProfile(await store.readJSON(PROFILE_KEY));
      setProfile(loaded);
      // A summary from the analyzer arrives as startapp=r1_… (SPEC 6.4). Nothing is saved without the coach's tap.
      const param = startParam();
      const summary = isSummaryParam(param) ? await decodeSummary(param) : undefined;
      const setupDone = !needsConsent(loaded) && !!loaded.mode;
      // Kept until setup is finished when it arrives on the very first launch.
      setReceived(setupDone ? undefined : summary);
      setScreen(needsConsent(loaded) ? { name: "consent" } : !loaded.mode ? { name: "mode" } : summary !== undefined ? { name: "received", summary } : { name: "home" });
      setSync(store.state());
      store.subscribe(setSync);
      setBoot({ kind: "ready", store });
      setItems(flatten(await loadBatches(store).catch(() => [])));
    } catch (e) {
      const old = e instanceof OldTelegramError;
      setBoot({ kind: "error", retry: !old, message: old ? translate(deviceLanguage(), "error.oldTelegram") : translate(deviceLanguage(), "error.load", { reason: e instanceof Error ? e.message : String(e) }) });
    }
  }, []);

  // Once per page (StrictMode runs effects twice in development).
  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; void start(); } }, [start]);

  // Send what is waiting when the network or the app comes back.
  useEffect(() => {
    if (boot.kind !== "ready") return;
    const flush = () => { void boot.store.flush(); };
    const visible = () => { if (document.visibilityState === "visible") flush(); };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", visible);
    webApp()?.onEvent?.("activated", flush);
    return () => { window.removeEventListener("online", flush); document.removeEventListener("visibilitychange", visible); webApp()?.offEvent?.("activated", flush); };
  }, [boot]);

  // Telegram changes theme variables itself; re-render so inline colours follow.
  const [, setThemeTick] = useState(0);
  useEffect(() => onThemeChange(() => setThemeTick(n => n + 1)), []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const save = useCallback(async (next: Profile) => {
    setProfile(next);
    if (boot.kind === "ready") await boot.store.writeJSON(PROFILE_KEY, next);
  }, [boot]);

  const reloadItems = useCallback(async () => {
    if (boot.kind === "ready") setItems(flatten(await loadBatches(boot.store).catch(() => [])));
  }, [boot]);

  const saveSummary = useCallback(async (summary: Summary): Promise<SaveResult> => {
    if (boot.kind !== "ready") return "exists";
    try {
      const result = await saveSelf(boot.store, summary);
      await reloadItems();
      haptic("success");
      return result;
    } catch (e) {
      if (e instanceof StoreError && e.code === "full") { haptic("error"); return "full"; }
      throw e;
    }
  }, [boot, reloadItems]);

  const deleteSummary = useCallback(async (id: string) => {
    if (boot.kind !== "ready") return;
    await removeSelf(boot.store, id);
    await reloadItems();
    setScreen({ name: "home" });
  }, [boot, reloadItems]);

  const afterSetup = useCallback((p: Profile) => {
    if (needsConsent(p)) return setScreen({ name: "consent" });
    if (!p.mode) return setScreen({ name: "mode" });
    if (received !== undefined) { setScreen({ name: "received", summary: received }); setReceived(undefined); return; }
    setScreen({ name: "home" });
  }, [received]);

  // Where Telegram's BackButton leads from each screen; consent and the first mode choice have no way back.
  useEffect(() => {
    if (boot.kind !== "ready") return;
    const back: Partial<Record<Screen["name"], () => void>> = {
      sport: () => setScreen({ name: "home" }),
      settings: () => setScreen({ name: "home" }),
      received: () => setScreen({ name: "home" }),
      detail: () => setScreen({ name: "home" }),
      mode: profile.mode ? () => setScreen({ name: "home" }) : undefined
    };
    return backButton(back[screen.name] ?? null);
  }, [boot, screen, profile.mode]);

  const content = useMemo(() => {
    if (boot.kind === "loading") return <div className="screen screen--center"><p className="hint">{translate(lang, "app.loading")}</p></div>;
    if (boot.kind === "outside") return <Outside />;
    if (boot.kind === "error") return (
      <div className="screen screen--center">
        <p className="error">{boot.message}</p>
        {boot.retry && <button className="button" onClick={() => void start()}>{translate(lang, "app.retry")}</button>}
      </div>
    );
    switch (screen.name) {
      case "consent": return <Consent onAccept={() => { haptic("success"); const next = accept(profile); void save(next); afterSetup(next); }} />;
      case "mode": return <ModeSelect current={profile.mode} onPick={(mode: Mode) => { const next = { ...profile, mode }; void save(next); afterSetup(next); }} />;
      case "sport": return <SportPick />;
      case "settings": return <Settings store={boot.store} profile={profile} sync={sync} onChange={next => void save(next)} />;
      case "received": return <Received summary={screen.summary} saved={!!screen.summary && !!items?.some(x => x.id === screen.summary!.id)}
        onSave={saveSummary} onOpen={id => setScreen({ name: "detail", id })} onDone={() => setScreen({ name: "home" })} />;
      case "detail": {
        const summary = items?.find(x => x.id === screen.id);
        if (summary) return <Detail summary={summary} items={items!} onDelete={id => void deleteSummary(id)} />;
      }
      // falls through: the analysis was deleted on another device
      default: return <Home mode={profile.mode ?? "self"} items={items} onNewAnalysis={() => setScreen({ name: "sport" })} onOpen={id => setScreen({ name: "detail", id })} />;
    }
  }, [boot, screen, profile, sync, lang, items, save, afterSetup, start, saveSummary, deleteSummary]);

  const showHeader = boot.kind === "ready" && screen.name !== "consent" && !(screen.name === "mode" && !profile.mode);
  return (
    <LanguageContext.Provider value={lang}>
      <div className="app">
        {showHeader && <Header mode={profile.mode ?? "self"} onMode={() => setScreen({ name: "mode" })} onSettings={() => setScreen({ name: "settings" })} />}
        {boot.kind === "ready" && sync.pending > 0 && <SyncBar pending={sync.pending} />}
        {content}
      </div>
    </LanguageContext.Provider>
  );
}

function Header({ mode, onMode, onSettings }: { mode: Mode; onMode: () => void; onSettings: () => void }) {
  const t = useT();
  return (
    <header className="header">
      <span className="header__title">{t("app.name")}</span>
      <button className="chip" onClick={onMode} aria-label={t("mode.switch")}>{t(mode === "coach" ? "mode.coach" : "mode.self")}<span aria-hidden="true"> ⇄</span></button>
      <button className="icon-button" onClick={onSettings} aria-label={t("app.settings")} title={t("app.settings")}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>
      </button>
    </header>
  );
}

function SyncBar({ pending }: { pending: number }) {
  const t = useT();
  return <div className="sync-bar" role="status">{t("sync.pending", { n: pending })}</div>;
}
