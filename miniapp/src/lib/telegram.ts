// The only place that knows about Telegram.WebApp (adapted from coach-tg/frontend/src/lib/telegram.ts).
// Everything here degrades to "not in Telegram" so the app can explain itself when opened in a plain browser.

export type TelegramUser = { id: number; first_name?: string; username?: string; language_code?: string };

type Callback<T> = (error: string | null, result?: T) => void;
export type CloudStorageApi = {
  setItem(key: string, value: string, cb?: Callback<boolean>): void;
  getItem(key: string, cb: Callback<string>): void;
  getItems(keys: string[], cb: Callback<Record<string, string>>): void;
  removeItem(key: string, cb?: Callback<boolean>): void;
  removeItems(keys: string[], cb?: Callback<boolean>): void;
  getKeys(cb: Callback<string[]>): void;
};
export type DeviceStorageApi = {
  setItem(key: string, value: string, cb?: Callback<boolean>): void;
  getItem(key: string, cb: Callback<string | null>): void;
  removeItem(key: string, cb?: Callback<boolean>): void;
};
type Button = { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };

export type WebApp = {
  initData: string;
  initDataUnsafe?: { user?: TelegramUser; start_param?: string };
  platform?: string;
  version?: string;
  colorScheme?: "light" | "dark";
  isVersionAtLeast?(version: string): boolean;
  ready(): void;
  expand(): void;
  openLink(url: string, options?: { try_instant_view?: boolean; try_browser?: string }): void;
  openTelegramLink(url: string): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  showAlert?(message: string, cb?: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent?(event: string, cb: () => void): void;
  offEvent?(event: string, cb: () => void): void;
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred?(type: string): void };
  BackButton?: Button;
  SettingsButton?: Button;
  CloudStorage?: CloudStorageApi;
  DeviceStorage?: DeviceStorageApi;
};

export const BOT = "coach_desk_lite_bot";

export function webApp(): WebApp | null {
  return typeof window === "undefined" ? null : ((window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp ?? null);
}

/** Opened as a Mini App: Telegram passed signed launch data. A plain browser has the script but no initData. */
export function inTelegram(app: WebApp | null = webApp()): boolean {
  return !!(app && (app.initData || app.initDataUnsafe?.user?.id));
}

export const atLeast = (version: string, app: WebApp | null = webApp()) => !!app?.isVersionAtLeast?.(version);

export function initTelegram(): void {
  const app = webApp();
  if (!app) return;
  app.ready();
  app.expand();
  try { app.setHeaderColor?.("bg_color"); app.setBackgroundColor?.("bg_color"); } catch { /* old clients */ }
}

export const tgUser = (): TelegramUser | null => webApp()?.initDataUnsafe?.user ?? null;
export const platform = (): string => webApp()?.platform ?? "unknown";

/** `startapp` of the link that opened the Mini App (also passed as ?tgWebAppStartParam=). */
export function startParam(): string | null {
  const fromApp = webApp()?.initDataUnsafe?.start_param;
  if (fromApp) return fromApp;
  try { return new URLSearchParams(location.search).get("tgWebAppStartParam"); } catch { return null; }
}

export function haptic(kind: "light" | "success" | "error" = "light"): void {
  const h = webApp()?.HapticFeedback;
  if (!h) return;
  if (kind === "light") h.impactOccurred("light");
  else h.notificationOccurred?.(kind);
}

/** Opens a page in the phone's browser (the analyzer, documents). Must be called from a tap. */
export function openExternal(url: string, options?: { try_browser?: "chrome" }): void {
  const app = webApp();
  if (app && inTelegram(app)) app.openLink(url, options);
  else window.open(url, "_blank", "noopener");
}

/** Telegram's own BackButton instead of browser history (history in the WebView is unreliable). */
export function backButton(onClick: (() => void) | null): () => void {
  const button = webApp()?.BackButton;
  if (!button || !atLeast("6.1")) return () => {};
  if (!onClick) { button.hide(); return () => {}; }
  button.onClick(onClick); button.show();
  return () => { button.offClick(onClick); button.hide(); };
}

/** Telegram's confirm dialog: window.confirm blocks the WebView's event loop. */
export function confirmDialog(message: string): Promise<boolean> {
  const app = webApp();
  if (!app?.showConfirm || !atLeast("6.2")) return Promise.resolve(window.confirm(message));
  return new Promise(resolve => app.showConfirm!(message, resolve));
}

export function onThemeChange(cb: () => void): () => void {
  const app = webApp();
  app?.onEvent?.("themeChanged", cb);
  return () => app?.offEvent?.("themeChanged", cb);
}
