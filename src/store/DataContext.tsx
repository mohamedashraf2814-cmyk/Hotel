import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { emptyData } from '../lib/defaults';
import { PREFIX, clearAllStored, loadAll, saveChanges, type LoadResult } from '../lib/storage';
import type { ActionResult, AppData } from '../lib/types';

interface DataContextValue {
  data: AppData;
  persistent: boolean;
  warnings: string[];
  dismissWarnings: () => void;
  /** Runs a pure mutation, persists the result and updates the UI. Nothing changes if validation or saving fails. */
  run: (fn: (d: AppData) => ActionResult) => ActionResult;
  /** Replaces all data (used by backup restore). */
  replaceAll: (next: AppData) => { ok: true } | { ok: false; error: string };
  /** Deletes every saved record and starts from an empty system. */
  clearAll: () => void;
}

const Ctx = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const initialRef = useRef<LoadResult | null>(null);
  if (initialRef.current === null) initialRef.current = loadAll();
  const initial = initialRef.current;

  const [data, setData] = useState<AppData>(initial.data);
  const [persistent, setPersistent] = useState<boolean>(initial.persistent);
  const [warnings, setWarnings] = useState<string[]>(initial.warnings);
  const dataRef = useRef<AppData>(initial.data);

  const run = useCallback((fn: (d: AppData) => ActionResult): ActionResult => {
    const prev = dataRef.current;
    const res = fn(prev);
    if (!res.ok) return res;
    const saved = saveChanges(prev, res.data);
    if (!saved.ok) return { ok: false, error: saved.error };
    dataRef.current = res.data;
    setData(res.data);
    return res;
  }, []);

  const replaceAll = useCallback((next: AppData) => {
    const saved = saveChanges(null, next);
    if (!saved.ok) return saved;
    dataRef.current = next;
    setData(next);
    return { ok: true } as const;
  }, []);

  const clearAll = useCallback(() => {
    clearAllStored();
    const fresh = emptyData();
    dataRef.current = fresh;
    setData(fresh);
    setWarnings([]);
  }, []);

  // keep several open tabs of the same browser in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && !e.key.startsWith(PREFIX)) return;
      const r = loadAll();
      dataRef.current = r.data;
      setData(r.data);
      setPersistent(r.persistent);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({ data, persistent, warnings, dismissWarnings: () => setWarnings([]), run, replaceAll, clearAll }),
    [data, persistent, warnings, run, replaceAll, clearAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside DataProvider');
  return v;
}
