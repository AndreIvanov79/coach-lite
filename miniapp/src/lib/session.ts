// Builds the storage for this Telegram user: CloudStorage for data, DeviceStorage (or localStorage) for the outbox.
import { Store, browserKV, deviceKV, telegramKV } from "./cloud.ts";
import { atLeast, tgUser, webApp } from "./telegram.ts";

export class OldTelegramError extends Error {}

export async function openStore(): Promise<Store> {
  const app = webApp();
  if (!app?.CloudStorage || !atLeast("6.9", app)) throw new OldTelegramError("CloudStorage needs Bot API 6.9");
  const local = app.DeviceStorage && atLeast("9.0", app) ? deviceKV(app.DeviceStorage) : browserKV((() => { try { return localStorage; } catch { return null; } })());
  // One outbox per Telegram account: two accounts on one phone must not send each other's changes.
  const store = new Store(telegramKV(app.CloudStorage), local, { outboxKey: "cdl_outbox_" + (tgUser()?.id ?? 0) });
  await store.init();
  return store;
}
