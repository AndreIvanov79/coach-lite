import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, StoreError, browserKV, memoryKV, telegramKV, type KV } from "./cloud.ts";
import type { CloudStorageApi } from "./telegram.ts";

/** A cloud that can go offline, and a scheduler the test drives by hand. */
function setup() {
  const cloud = memoryKV();
  let offline = false;
  const flaky: KV = {
    get: keys => offline ? Promise.reject(new Error("offline")) : cloud.get(keys),
    set: (k, v) => offline ? Promise.reject(new Error("offline")) : cloud.set(k, v),
    remove: keys => offline ? Promise.reject(new Error("offline")) : cloud.remove(keys),
    keys: () => offline ? Promise.reject(new Error("offline")) : cloud.keys()
  };
  const timers: { fn: () => void; ms: number }[] = [];
  const local = browserKV(null);
  const make = () => new Store(flaky, local, { outboxKey: "ob", schedule: (fn, ms) => { const t = { fn, ms }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }; } });
  return { cloud, local, timers, make, setOffline: (v: boolean) => { offline = v; } };
}

test("writes reach the cloud and are read back", async () => {
  const { cloud, make } = setup();
  const store = make(); await store.init();
  await store.writeJSON("profile", { v: 1, mode: "coach" });
  await store.flush();
  assert.equal(cloud.data.get("profile"), '{"v":1,"mode":"coach"}');
  assert.deepEqual(await store.readJSON("profile"), { v: 1, mode: "coach" });
  assert.equal(store.state().pending, 0);
});

test("offline: the write waits on this device, is readable at once and goes out later", async () => {
  const { cloud, local, timers, make, setOffline } = setup();
  setOffline(true);
  const store = make(); await store.init();
  await store.write("week_2026_46", "marks");
  await store.flush();
  assert.equal(store.state().pending, 1);
  assert.equal(store.state().error, "offline");
  assert.equal(await store.read("week_2026_46"), "marks", "read-your-writes even offline");
  assert.equal(timers.at(-1)?.ms, 2000, "first retry in 2 s");
  await store.flush(); assert.equal(timers.at(-1)?.ms, 5000, "then 5 s");
  // The app is closed and opened again while still offline: the outbox is still there.
  const again = make(); await again.init();
  assert.equal(again.state().pending, 1);
  assert.equal(await again.flush(), false, "init tried to send and is still offline");
  setOffline(false);
  assert.equal(await again.flush(), true);
  assert.equal(cloud.data.get("week_2026_46"), "marks");
  assert.equal(again.state().pending, 0);
  assert.deepEqual(JSON.parse((await local.get("ob"))!), { v: 1, items: [] });
});

test("several writes to one key keep only the last; removals are queued too", async () => {
  const { cloud, make, setOffline } = setup();
  const store = make(); await store.init();
  await store.write("ath_1", "x"); await store.flush();
  setOffline(true);
  await store.write("groups", "a"); await store.write("groups", "b"); await store.remove("ath_1");
  assert.equal(store.state().pending, 2);
  assert.equal(await store.read("ath_1"), null);
  setOffline(false);
  await store.flush();
  assert.equal(cloud.data.get("groups"), "b");
  assert.ok(!cloud.data.has("ath_1"));
  assert.deepEqual(await store.keys(), ["groups"]);
});

test("a write made while sending is not lost", async () => {
  const cloud = memoryKV();
  let release!: () => void;
  const slow: KV = { ...cloud, set: (k, v) => new Promise<void>(r => { release = () => { void cloud.set(k, v).then(r); }; }) };
  const store = new Store(slow, browserKV(null));
  await store.init();
  const first = store.write("k", "1");
  await first;
  await store.write("k", "2");          // replaces the item that is being sent
  release();                            // "1" lands
  await new Promise(r => setTimeout(r, 0));
  release();                            // "2" lands
  await store.flush();
  assert.equal(cloud.data.get("k"), "2");
  assert.equal(store.state().pending, 0);
});

test("keys and values are checked before they are queued", async () => {
  const { make } = setup();
  const store = make(); await store.init();
  await assert.rejects(store.write("bad key", "v"), (e: unknown) => e instanceof StoreError && e.code === "bad_key");
  await assert.rejects(store.write("k".repeat(129), "v"), StoreError);
  await assert.rejects(store.write("big", "x".repeat(4097)), (e: unknown) => e instanceof StoreError && e.code === "too_large");
  await store.write("max", "x".repeat(4096));
  await store.flush();
  assert.equal((await store.read("max"))?.length, 4096, "exactly at the limit is fine");
});

test("Telegram CloudStorage callbacks become promises; empty strings mean missing", async () => {
  const data = new Map<string, string>([["a", "1"]]);
  const api: CloudStorageApi = {
    setItem: (k, v, cb) => { data.set(k, v); cb?.(null, true); },
    getItem: (k, cb) => cb(null, data.get(k) ?? ""),
    getItems: (keys, cb) => cb(null, Object.fromEntries(keys.map(k => [k, data.get(k) ?? ""]))),
    removeItem: (k, cb) => { data.delete(k); cb?.(null, true); },
    removeItems: (keys, cb) => { keys.forEach(k => data.delete(k)); cb?.(null, true); },
    getKeys: cb => cb(null, [...data.keys()])
  };
  const kv = telegramKV(api);
  assert.deepEqual(await kv.get(["a", "b"]), { a: "1" });
  await kv.set("b", "2"); assert.deepEqual(await kv.keys(), ["a", "b"]);
  await kv.remove(["a"]); assert.deepEqual(await kv.keys(), ["b"]);
  const broken = telegramKV({ ...api, setItem: (_k, _v, cb) => cb?.("STORAGE_KEY_INVALID") });
  await assert.rejects(broken.set("x", "y"), /STORAGE_KEY_INVALID/);
  const silent = telegramKV({ ...api, getKeys: () => {} }, 20);
  await assert.rejects(silent.keys(), /timeout/, "a call that never answers fails instead of hanging");
});
