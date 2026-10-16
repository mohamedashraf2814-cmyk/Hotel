import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayStr } from '../lib/dates';
import { formatDate, formatDateTime, formatInt, formatMoney, formatNumber, formatRate } from '../lib/format';
import type { CurrencyCode } from '../lib/types';
import { useData } from '../store/DataContext';

/** Today's date (YYYY-MM-DD), refreshed every minute so the app stays correct past midnight. */
export function useToday(): string {
  const [t, setT] = useState(() => todayStr());
  useEffect(() => {
    const id = window.setInterval(() => setT(todayStr()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

/** Formatters bound to the user's preferences (digits style, base currency). */
export function useFmt() {
  const { data } = useData();
  const s = data.settings;
  return useMemo(
    () => ({
      settings: s,
      money: (amount: number, code: CurrencyCode) => formatMoney(amount, code, s),
      base: (amount: number) => formatMoney(amount, s.baseCurrency, s),
      date: (d: string) => formatDate(d, s),
      dateTime: (d: string) => formatDateTime(d, s),
      int: (n: number) => formatInt(n, s),
      num: (n: number, decimals = 2) => formatNumber(n, s, decimals),
      rate: (n: number) => formatRate(n, s),
    }),
    [s],
  );
}

/** Opens a page's "new" form once when the URL carries ?new=1 (used by quick actions). */
export function useOpenNew(open: () => void) {
  const [params, setParams] = useSearchParams();
  const ref = useRef(open);
  ref.current = open;
  const want = params.get('new') === '1';
  useEffect(() => {
    if (!want) return;
    ref.current();
    const p = new URLSearchParams(params);
    p.delete('new');
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);
}

/** Animates a number from its previous value; respects reduced motion. */
export function useCountUp(target: number, ms = 800): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const first = useRef(true);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = first.current ? 0 : from.current;
    first.current = false;
    if (reduce || start === target) {
      setV(target);
      from.current = target;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = start + (target - start) * e;
      setV(cur);
      from.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
