// A stand-in for Telegram.WebApp with the same callback API, for the dev server (npm run dev, then open
// http://localhost:5173/?mock) and the browser QA. Never part of the built app.
// URL options: ?mock&lang=ro&platform=tdesktop&theme=light&startapp=<param>&user=2
// Test hooks: window.__tg = { opened: [...links], back(), offline(boolean), cloud(), reset() }.
(() => {
  const q = new URLSearchParams(location.search);
  const ls = (() => { try { return localStorage; } catch { return null; } })();
  const userId = Number(q.get("user") || 1);
  const prefix = "mock-cloud:" + userId + ":", devicePrefix = "mock-device:" + userId + ":";
  let offline = false;
  const opened = [], handlers = { back: new Set(), settings: new Set() }, events = {};
  const later = fn => setTimeout(fn, 15);
  const cloudKeys = () => Object.keys(ls ?? {}).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
  const button = name => ({
    isVisible: false,
    show() { this.isVisible = true; document.documentElement.dataset[name] = "1"; },
    hide() { this.isVisible = false; delete document.documentElement.dataset[name]; },
    onClick(cb) { handlers[name].add(cb); }, offClick(cb) { handlers[name].delete(cb); }
  });
  const fail = cb => later(() => cb && cb("offline"));
  const CloudStorage = {
    setItem(k, v, cb) { if (offline) return fail(cb); ls.setItem(prefix + k, String(v)); later(() => cb && cb(null, true)); },
    getItem(k, cb) { if (offline) return fail(cb); later(() => cb(null, ls.getItem(prefix + k) ?? "")); },
    getItems(keys, cb) { if (offline) return fail(cb); const out = {}; for (const k of keys) out[k] = ls.getItem(prefix + k) ?? ""; later(() => cb(null, out)); },
    removeItem(k, cb) { if (offline) return fail(cb); ls.removeItem(prefix + k); later(() => cb && cb(null, true)); },
    removeItems(keys, cb) { if (offline) return fail(cb); for (const k of keys) ls.removeItem(prefix + k); later(() => cb && cb(null, true)); },
    getKeys(cb) { if (offline) return fail(cb); later(() => cb(null, cloudKeys())); }
  };
  const DeviceStorage = {
    setItem(k, v, cb) { ls.setItem(devicePrefix + k, String(v)); later(() => cb && cb(null, true)); },
    getItem(k, cb) { later(() => cb(null, ls.getItem(devicePrefix + k))); },
    removeItem(k, cb) { ls.removeItem(devicePrefix + k); later(() => cb && cb(null, true)); }
  };
  const light = q.get("theme") === "light";
  const theme = light
    ? { bg_color: "#ffffff", text_color: "#000000", hint_color: "#8e8e93", link_color: "#2481cc", button_color: "#2481cc", button_text_color: "#ffffff", secondary_bg_color: "#f0f0f4", section_bg_color: "#ffffff", destructive_text_color: "#d14e4e" }
    : { bg_color: "#17212b", text_color: "#f5f5f5", hint_color: "#708499", link_color: "#6ab3f3", button_color: "#5288c1", button_text_color: "#ffffff", secondary_bg_color: "#232e3c", section_bg_color: "#17212b", destructive_text_color: "#ec3942" };
  // As an init script this runs before <html> exists: paint the theme once it does.
  const paint = () => { for (const [k, v] of Object.entries(theme)) document.documentElement.style.setProperty("--tg-theme-" + k.replace(/_/g, "-"), v); };
  if (document.documentElement) paint(); else document.addEventListener("readystatechange", paint, { once: true });
  const version = q.get("version") || "9.6";
  const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 2; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
  const WebApp = {
    initData: "query_id=mock&user=%7B%22id%22%3A" + userId + "%7D&hash=mock",
    initDataUnsafe: { user: { id: userId, first_name: "Test", language_code: q.get("lang") || "ru" }, start_param: q.get("startapp") || undefined },
    platform: q.get("platform") || "android", version, colorScheme: light ? "light" : "dark", themeParams: theme,
    isVersionAtLeast: v => cmp(version, v) >= 0,
    ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {},
    openLink(url, options) { opened.push({ url, options: options ?? null }); },
    openTelegramLink(url) { opened.push({ url, telegram: true }); },
    showConfirm(message, cb) { later(() => cb(true)); }, showAlert(message, cb) { later(() => cb && cb()); },
    onEvent(name, cb) { (events[name] ??= new Set()).add(cb); }, offEvent(name, cb) { events[name]?.delete(cb); },
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    BackButton: button("back"), SettingsButton: button("settings"),
    CloudStorage: cmp(version, "6.9") >= 0 ? CloudStorage : undefined,
    DeviceStorage: cmp(version, "9.0") >= 0 ? DeviceStorage : undefined
  };
  window.Telegram = { WebApp };
  window.__tg = {
    opened,
    back() { for (const cb of [...handlers.back]) cb(); },
    offline(value) { offline = !!value; if (!offline) for (const cb of events.activated ?? []) cb(); },
    cloud() { const out = {}; for (const k of cloudKeys()) out[k] = ls.getItem(prefix + k); return out; },
    reset() { for (const k of Object.keys(ls)) if (k.startsWith("mock-")) ls.removeItem(k); }
  };
})();
