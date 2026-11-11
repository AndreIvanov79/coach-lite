// "My progress": Self-training summaries in CloudStorage, several per key (self_1, self_2, …; SPEC 8.5).
// A key holds up to 4096 characters, about 8-12 summaries; the next key starts when the last one is full.
import { LIMITS, StoreError, type Store } from "./cloud.ts";
import { validateSummary, type Summary } from "../../../shared/summary.ts";

const SELF = /^self_(\d+)$/;
export type Batch = { key: string; n: number; items: Summary[] };

const pack = (items: Summary[]) => JSON.stringify({ v: 1, items });

export function parseBatch(key: string, text: string | null): Batch | null {
  const m = key.match(SELF);
  if (!m || !text) return null;
  try {
    const raw = JSON.parse(text) as { v?: number; items?: unknown[] };
    const items = (raw?.v === 1 && Array.isArray(raw.items) ? raw.items : []).map(validateSummary).filter((s): s is Summary => !!s);
    return { key, n: Number(m[1]), items };
  } catch { return null; }
}

export async function loadBatches(store: Store): Promise<Batch[]> {
  const keys = (await store.keys()).filter(k => SELF.test(k));
  if (!keys.length) return [];
  const values = await store.readMany(keys);
  return keys.map(k => parseBatch(k, values[k])).filter((b): b is Batch => !!b).sort((a, b) => a.n - b.n);
}

/** All summaries, newest first, each id once. */
export function flatten(batches: Batch[]): Summary[] {
  const seen = new Set<string>(), out: Summary[] = [];
  for (const b of batches) for (const s of b.items) if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
  return out.sort((a, b) => b.t - a.t || a.id.localeCompare(b.id));
}

/** Where a new summary goes: the last key if it still fits, else a new one. null when it is already saved. */
export function planSave(batches: Batch[], summary: Summary): { key: string; items: Summary[]; isNew: boolean } | null {
  if (batches.some(b => b.items.some(s => s.id === summary.id))) return null;
  const item: Summary = { ...summary };
  delete item.a; delete item.in; // Self-training: no athlete, no inbox
  const last = batches.at(-1);
  if (last && pack([...last.items, item]).length <= LIMITS.valueLength) return { key: last.key, items: [...last.items, item], isNew: false };
  return { key: "self_" + ((last?.n ?? 0) + 1), items: [item], isNew: true };
}

export async function saveSelf(store: Store, summary: Summary): Promise<"saved" | "exists"> {
  const batches = await loadBatches(store);
  const plan = planSave(batches, summary);
  if (!plan) return "exists";
  if (plan.isNew && (await store.keys()).length >= LIMITS.keys) throw new StoreError("full", "Telegram CloudStorage is full (1024 keys)");
  await store.write(plan.key, pack(plan.items));
  return "saved";
}

export async function removeSelf(store: Store, id: string): Promise<boolean> {
  for (const b of await loadBatches(store)) {
    if (!b.items.some(s => s.id === id)) continue;
    const rest = b.items.filter(s => s.id !== id);
    await store.write(b.key, rest.length ? pack(rest) : null);
    return true;
  }
  return false;
}

/** One figure over time for the same sport and exercise, oldest first: the progress chart. */
export function series(items: Summary[], of: Pick<Summary, "s" | "e">, figure: string): { t: number; value: number; id: string }[] {
  return items.filter(s => s.s === of.s && s.e === of.e && typeof s.k[figure] === "number")
    .map(s => ({ t: s.t, value: s.k[figure], id: s.id }))
    .sort((a, b) => a.t - b.t);
}
