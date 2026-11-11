// The coach's data lives in Telegram CloudStorage (SPEC 8.5): synced across their devices, invisible to us.
// Writes go through an outbox kept on this device (Telegram DeviceStorage, else localStorage) and are retried,
// so a mark set in a gym without network is not lost (the offline queue idea of coach-desk: enqueue + flushOutbox).
// No React and no Telegram globals here: the APIs are passed in, which keeps it testable in Node.
import type { CloudStorageApi, DeviceStorageApi } from "./telegram.ts";

/** Telegram limits: 1024 keys per user per bot, key 1-128 of A-Z a-z 0-9 _ -, value up to 4096 characters. */
export const LIMITS = { keys: 1024, keyLength: 128, valueLength: 4096 } as const;
const KEY = /^[A-Za-z0-9_-]{1,128}$/;

export type KV = {
  /** Missing keys are left out of the result. */
  get(keys: string[]): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  keys(): Promise<string[]>;
};
export type LocalKV = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> };

export class StoreError extends Error {
  readonly code: "bad_key" | "too_large" | "full";
  constructor(code: StoreError["code"], message: string) { super(message); this.code = code; }
}

function promised<T>(call: (cb: (error: string | null, result?: T) => void) => void, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    try {
      call((error, result) => { clearTimeout(timer); if (error) reject(new Error(String(error))); else resolve(result as T); });
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}

/** CloudStorage with promises and a timeout (a call without network may never answer). */
export function telegramKV(api: CloudStorageApi, timeoutMs = 10000): KV {
  return {
    async get(keys) {
      const out: Record<string, string> = {};
      for (let i = 0; i < keys.length; i += 64) {
        const part = await promised<Record<string, string>>(cb => api.getItems(keys.slice(i, i + 64), cb), timeoutMs);
        for (const [k, v] of Object.entries(part ?? {})) if (v !== "" && v != null) out[k] = v; // Telegram returns "" for a missing key
      }
      return out;
    },
    async set(key, value) {
      const ok = await promised<boolean>(cb => api.setItem(key, value, cb), timeoutMs);
      if (ok === false) throw new Error("not stored");
    },
    async remove(keys) { if (keys.length) await promised<boolean>(cb => api.removeItems(keys, cb), timeoutMs); },
    async keys() { return (await promised<string[]>(cb => api.getKeys(cb), timeoutMs)) ?? []; }
  };
}

/** In memory: tests and the preview outside Telegram. */
export function memoryKV(data = new Map<string, string>()): KV & { data: Map<string, string> } {
  return {
    data,
    async get(keys) { const out: Record<string, string> = {}; for (const k of keys) { const v = data.get(k); if (v !== undefined) out[k] = v; } return out; },
    async set(key, value) { data.set(key, value); },
    async remove(keys) { for (const k of keys) data.delete(k); },
    async keys() { return [...data.keys()]; }
  };
}

export function deviceKV(api: DeviceStorageApi, timeoutMs = 5000): LocalKV {
  return {
    async get(key) { return (await promised<string | null>(cb => api.getItem(key, cb), timeoutMs)) || null; },
    async set(key, value) { await promised<boolean>(cb => api.setItem(key, value, cb), timeoutMs); }
  };
}

export function browserKV(storage: Pick<Storage, "getItem" | "setItem"> | null): LocalKV {
  const memory = new Map<string, string>();
  return {
    async get(key) { try { return storage ? storage.getItem(key) : memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
    async set(key, value) { memory.set(key, value); try { storage?.setItem(key, value); } catch { /* private mode: memory only */ } }
  };
}

type Pending = { k: string; v: string | null; at: number };
export type StoreState = { pending: number; error: string | null };
const RETRY = [2000, 5000, 15000, 60000];

export type StoreOptions = {
  outboxKey?: string;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => () => void;
};

export class Store {
  private outbox: Pending[] = [];
  private flushing: Promise<boolean> | null = null;
  private attempt = 0;
  private cancelRetry: (() => void) | null = null;
  private listeners = new Set<(s: StoreState) => void>();
  private error: string | null = null;
  private readonly cloud: KV;
  private readonly local: LocalKV;
  private readonly outboxKey: string;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => () => void;

  // No parameter properties: Node runs these files with type stripping only (tests).
  constructor(cloud: KV, local: LocalKV, options: StoreOptions = {}) {
    this.cloud = cloud; this.local = local;
    this.outboxKey = options.outboxKey ?? "cdl_outbox";
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); });
  }

  /** Loads what was not sent last time and tries to send it. */
  async init(): Promise<void> {
    try {
      const saved = JSON.parse((await this.local.get(this.outboxKey)) ?? "null") as { v: 1; items: Pending[] } | null;
      if (saved?.v === 1 && Array.isArray(saved.items))
        this.outbox = saved.items.filter(p => typeof p?.k === "string" && KEY.test(p.k) && (p.v === null || typeof p.v === "string"));
    } catch { this.outbox = []; }
    this.emit();
    if (this.outbox.length) void this.flush();
  }

  state(): StoreState { return { pending: this.outbox.length, error: this.error }; }
  subscribe(listener: (s: StoreState) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit() { const s = this.state(); for (const l of this.listeners) l(s); }

  /** Reads see this device's unsent writes first. */
  async readMany(keys: string[]): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    const local = new Map(this.outbox.map(p => [p.k, p.v]));
    const remote = keys.filter(k => !local.has(k));
    const got = remote.length ? await this.cloud.get(remote) : {};
    for (const k of keys) out[k] = local.has(k) ? local.get(k)! : got[k] ?? null;
    return out;
  }
  async read(key: string): Promise<string | null> { return (await this.readMany([key]))[key]; }
  async readJSON<T>(key: string): Promise<T | null> {
    const text = await this.read(key);
    if (text === null) return null;
    try { return JSON.parse(text) as T; } catch { return null; }
  }

  async keys(): Promise<string[]> {
    const all = new Set(await this.cloud.keys());
    for (const p of this.outbox) { if (p.v === null) all.delete(p.k); else all.add(p.k); }
    return [...all].sort();
  }

  /** Queues a write (null removes the key) and tries to send it now. Resolves once it is safe on this device. */
  async write(key: string, value: string | null): Promise<void> {
    if (!KEY.test(key)) throw new StoreError("bad_key", "bad key: " + key);
    if (value !== null && value.length > LIMITS.valueLength) throw new StoreError("too_large", `${key}: ${value.length} > ${LIMITS.valueLength} characters`);
    this.outbox = this.outbox.filter(p => p.k !== key);
    this.outbox.push({ k: key, v: value, at: this.now() });
    await this.persist();
    this.emit();
    void this.flush();
  }
  writeJSON(key: string, value: unknown): Promise<void> { return this.write(key, JSON.stringify(value)); }
  remove(key: string): Promise<void> { return this.write(key, null); }

  private async persist() {
    try { await this.local.set(this.outboxKey, JSON.stringify({ v: 1, items: this.outbox })); }
    catch { /* the outbox stays in memory; it is still sent while the app is open */ }
  }

  /** Sends the outbox in order; on a failure keeps the rest and retries later (2 s, 5 s, 15 s, then every minute). */
  flush(): Promise<boolean> {
    if (this.flushing) return this.flushing;
    this.cancelRetry?.(); this.cancelRetry = null;
    this.flushing = (async () => {
      while (this.outbox.length) {
        const item = this.outbox[0];
        try {
          if (item.v === null) await this.cloud.remove([item.k]); else await this.cloud.set(item.k, item.v);
        } catch (e) {
          this.error = e instanceof Error ? e.message : String(e);
          const delay = RETRY[Math.min(this.attempt++, RETRY.length - 1)];
          this.cancelRetry = this.schedule(() => { this.cancelRetry = null; void this.flush(); }, delay);
          this.emit();
          return false;
        }
        // A newer write of the same key may have replaced this one while it was being sent.
        if (this.outbox[0] === item) this.outbox.shift();
        await this.persist();
        this.emit();
      }
      this.attempt = 0; this.error = null; this.emit();
      return true;
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }
}
