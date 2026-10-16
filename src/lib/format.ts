import { currencyInfo } from './currencies';
import { isValidDateStr } from './dates';
import type { CurrencyCode, Settings } from './types';

type Fmt = Pick<Settings, 'digits'>;

const numCache = new Map<string, Intl.NumberFormat>();
function numberFormat(digits: Fmt['digits'], decimals: number): Intl.NumberFormat {
  const key = `${digits}:${decimals}`;
  let f = numCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(digits === 'arab' ? 'ar-EG' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numCache.set(key, f);
  }
  return f;
}

export function formatInt(n: number, s: Fmt): string {
  return numberFormat(s.digits, 0).format(n);
}

export function formatNumber(n: number, s: Fmt, decimals = 2): string {
  return numberFormat(s.digits, decimals).format(n);
}

export function formatMoney(amount: number, code: CurrencyCode, s: Fmt): string {
  const info = currencyInfo(code);
  // non-breaking space keeps the amount and its currency together
  return `${numberFormat(s.digits, info.decimals).format(amount)}\u00A0${info.symbol}`;
}

export function formatRate(rate: number, s: Fmt): string {
  return new Intl.NumberFormat(s.digits === 'arab' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 6 }).format(rate);
}

const dateCache = new Map<string, Intl.DateTimeFormat>();
function dateFormat(digits: Fmt['digits']): Intl.DateTimeFormat {
  let f = dateCache.get(digits);
  if (!f) {
    f = new Intl.DateTimeFormat(digits === 'arab' ? 'ar-EG' : 'ar-EG-u-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    dateCache.set(digits, f);
  }
  return f;
}

export function formatDate(s: string, f: Fmt): string {
  if (!isValidDateStr(s)) return s || '—';
  const [y, m, d] = s.split('-').map(Number);
  return dateFormat(f.digits).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateTime(iso: string, f: Fmt): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(f.digits === 'arab' ? 'ar-EG' : 'ar-EG-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
