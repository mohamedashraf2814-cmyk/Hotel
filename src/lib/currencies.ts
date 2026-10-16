import type { CurrencyCode } from './types';

export interface CurrencyInfo {
  code: CurrencyCode;
  nameAr: string;
  symbol: string;
  decimals: number;
}

/** Catalogue of currencies the user can enable. Exchange rates are entered by the user (no external API). */
export const CURRENCY_CATALOG: CurrencyInfo[] = [
  { code: 'EGP', nameAr: 'جنيه مصري', symbol: 'ج.م', decimals: 2 },
  { code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س', decimals: 2 },
  { code: 'AED', nameAr: 'درهم إماراتي', symbol: 'د.إ', decimals: 2 },
  { code: 'USD', nameAr: 'دولار أمريكي', symbol: '$', decimals: 2 },
  { code: 'EUR', nameAr: 'يورو', symbol: '€', decimals: 2 },
  { code: 'GBP', nameAr: 'جنيه إسترليني', symbol: '£', decimals: 2 },
  { code: 'KWD', nameAr: 'دينار كويتي', symbol: 'د.ك', decimals: 3 },
  { code: 'QAR', nameAr: 'ريال قطري', symbol: 'ر.ق', decimals: 2 },
  { code: 'BHD', nameAr: 'دينار بحريني', symbol: 'د.ب', decimals: 3 },
  { code: 'OMR', nameAr: 'ريال عماني', symbol: 'ر.ع', decimals: 3 },
  { code: 'JOD', nameAr: 'دينار أردني', symbol: 'د.أ', decimals: 3 },
  { code: 'TRY', nameAr: 'ليرة تركية', symbol: '₺', decimals: 2 },
  { code: 'MAD', nameAr: 'درهم مغربي', symbol: 'د.م', decimals: 2 },
  { code: 'TND', nameAr: 'دينار تونسي', symbol: 'د.ت', decimals: 3 },
  { code: 'DZD', nameAr: 'دينار جزائري', symbol: 'د.ج', decimals: 2 },
  { code: 'LYD', nameAr: 'دينار ليبي', symbol: 'د.ل', decimals: 3 },
  { code: 'IQD', nameAr: 'دينار عراقي', symbol: 'د.ع', decimals: 0 },
  { code: 'LBP', nameAr: 'ليرة لبنانية', symbol: 'ل.ل', decimals: 0 },
  { code: 'SDG', nameAr: 'جنيه سوداني', symbol: 'ج.س', decimals: 2 },
  { code: 'YER', nameAr: 'ريال يمني', symbol: 'ر.ي', decimals: 0 },
];

const byCode = new Map(CURRENCY_CATALOG.map((c) => [c.code, c]));

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return byCode.get(code) ?? { code, nameAr: code, symbol: code, decimals: 2 };
}

export function isKnownCurrency(code: string): boolean {
  return byCode.has(code);
}

/** Round to the currency's number of decimals (avoids floating point drift). */
export function roundCur(value: number, code: CurrencyCode): number {
  const d = currencyInfo(code).decimals;
  const f = 10 ** d;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Round an exchange rate to 6 decimals. */
export function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}
