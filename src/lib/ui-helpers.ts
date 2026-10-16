import { currencyInfo } from './currencies';
import type { Settings } from './types';

/** Parses a numeric form value. Empty or invalid input becomes NaN so validation can reject it. */
export function toNum(s: string): number {
  const t = s.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫', '.').replace(/,/g, '');
  if (t === '') return NaN;
  return Number(t);
}

export function currencyOptions(settings: Settings): { value: string; label: string }[] {
  return settings.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${currencyInfo(c.code).nameAr}` }));
}

/** Plain-number string for form inputs (no grouping, trimmed decimals). */
export function numStr(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '';
  return String(Math.round(n * 1e6) / 1e6);
}

export function includesText(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}
