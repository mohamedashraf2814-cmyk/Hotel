import { useEffect, useMemo, useState } from 'react';
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
