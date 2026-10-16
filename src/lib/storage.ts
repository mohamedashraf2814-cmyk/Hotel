/**
 * Storage service — the ONLY module that touches localStorage.
 *
 * Keys (all prefixed with "hms:v1:"):
 *   meta          { schemaVersion }  — storage schema version, used for future migrations
 *   settings      hotel details, currencies and exchange rates, preferences
 *   rooms         Room[]
 *   guests        Guest[]
 *   reservations  Reservation[]
 *   payments      Payment[]
 *   expenses      Expense[]
 *   counters      sequence counters (reservation numbers are never reused)
 *   corrupt:*     raw copy of any value that failed to parse, kept so nothing is silently lost
 *
 * localStorage is per-browser, per-device and NOT secure. If it is unavailable the
 * service falls back to an in-memory store (data is lost on reload) and reports it.
 */
import { SCHEMA_VERSION, emptyData } from './defaults';
import { validateAppData } from './backup';
import type { AppData } from './types';

export const PREFIX = 'hms:v1:';
const COLLECTION_KEYS = ['settings', 'rooms', 'guests', 'reservations', 'payments', 'expenses', 'counters'] as const;
type CollectionKey = (typeof COLLECTION_KEYS)[number];

const memory = new Map<string, string>();
let persistent: Storage | null | undefined;

function getStore(): Storage | null {
  if (persistent !== undefined) return persistent;
  try {
    const s = window.localStorage;
    const probe = `${PREFIX}__probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    persistent = s;
  } catch {
    persistent = null;
  }
  return persistent;
}

export function isPersistent(): boolean {
  return getStore() !== null;
}

function rawGet(key: string): string | null {
  const s = getStore();
  try {
    return s ? s.getItem(PREFIX + key) : (memory.get(key) ?? null);
  } catch {
    return null;
  }
}

function rawSet(key: string, value: string): void {
  const s = getStore();
  if (s) s.setItem(PREFIX + key, value);
  else memory.set(key, value);
}

function rawRemove(key: string): void {
  const s = getStore();
  try {
    if (s) s.removeItem(PREFIX + key);
    else memory.delete(key);
  } catch {
    /* ignore */
  }
}

export interface LoadResult {
  data: AppData;
  persistent: boolean;
  warnings: string[];
}

/** Loads everything. Never throws; corrupted values are preserved under "corrupt:*" and replaced by defaults. */
export function loadAll(): LoadResult {
  const warnings: string[] = [];
  const candidate: Record<string, unknown> = {};
  const defaults = emptyData() as unknown as Record<string, unknown>;
  let anyCorrupt = false;

  const metaRaw = rawGet('meta');
  if (metaRaw) {
    try {
      const meta = JSON.parse(metaRaw) as { schemaVersion?: number };
      if (typeof meta.schemaVersion === 'number' && meta.schemaVersion > SCHEMA_VERSION)
        warnings.push('البيانات المحفوظة أنشأتها نسخة أحدث من التطبيق، وقد لا تُعرض بشكل صحيح.');
    } catch {
      /* meta is rewritten on the next save */
    }
  }

  for (const key of COLLECTION_KEYS) {
    const raw = rawGet(key);
    if (raw === null) {
      candidate[key] = defaults[key];
      continue;
    }
    try {
      candidate[key] = JSON.parse(raw);
    } catch {
      anyCorrupt = true;
      candidate[key] = defaults[key];
      warnings.push(`تعذّرت قراءة جزء «${key}» من البيانات المحفوظة (تالف). تم الاحتفاظ بنسخة منه.`);
      try {
        rawSet(`corrupt:${key}:${Date.now()}`, raw);
      } catch {
        /* storage may be full */
      }
    }
  }

  const v = validateAppData(candidate);
  if (v.ok) return { data: v.data, persistent: isPersistent(), warnings };

  // Stored data failed validation: keep a raw copy and start empty rather than crash.
  warnings.push(`البيانات المحفوظة غير صالحة (${v.error}). بدأ التطبيق بنظام فارغ وتم الاحتفاظ بنسخة من القديمة.`);
  if (!anyCorrupt) {
    try {
      rawSet(`corrupt:all:${Date.now()}`, JSON.stringify(candidate));
    } catch {
      /* ignore */
    }
  }
  return { data: emptyData(), persistent: isPersistent(), warnings };
}

export type SaveResult = { ok: true } | { ok: false; error: string };

function describeError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return 'مساحة التخزين في المتصفح ممتلئة. صدّر نسخة احتياطية ثم احذف بعض السجلات.';
  return 'تعذّر الحفظ في تخزين المتصفح.';
}

/**
 * Persists every collection that changed between prev and next.
 * All-or-nothing: if any write fails, already written keys are restored.
 */
export function saveChanges(prev: AppData | null, next: AppData): SaveResult {
  const written: { key: string; old: string | null }[] = [];
  try {
    for (const key of COLLECTION_KEYS) {
      const k: CollectionKey = key;
      if (prev && prev[k] === next[k]) continue;
      written.push({ key: k, old: rawGet(k) });
      rawSet(k, JSON.stringify(next[k]));
    }
    if (written.length || !prev) rawSet('meta', JSON.stringify({ schemaVersion: SCHEMA_VERSION }));
    return { ok: true };
  } catch (e) {
    for (const w of written.reverse()) {
      try {
        if (w.old === null) rawRemove(w.key);
        else rawSet(w.key, w.old);
      } catch {
        /* best effort */
      }
    }
    return { ok: false, error: describeError(e) };
  }
}

/** Removes every key owned by this app. */
export function clearAllStored(): void {
  const s = getStore();
  if (!s) {
    memory.clear();
    return;
  }
  const toRemove: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => s.removeItem(k));
}

export function approximateUsageBytes(): number {
  const s = getStore();
  if (!s) return 0;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(PREFIX)) total += (k.length + (s.getItem(k)?.length ?? 0)) * 2;
  }
  return total;
}
