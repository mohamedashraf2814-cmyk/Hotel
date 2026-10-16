const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateStr(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtc(s: string): number {
  const m = DATE_RE.exec(s)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Today's date in the user's local time zone as YYYY-MM-DD. */
export function todayStr(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(s: string, days: number): string {
  return fromUtc(toUtc(s) + days * 86400000);
}

/** Number of nights between check-in and check-out (0 if invalid). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!isValidDateStr(checkIn) || !isValidDateStr(checkOut)) return 0;
  return Math.round((toUtc(checkOut) - toUtc(checkIn)) / 86400000);
}

/** Half-open interval overlap: [aIn, aOut) and [bIn, bOut). Same-day turnover is allowed. */
export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

export function firstDayOfMonth(s: string): string {
  return `${s.slice(0, 7)}-01`;
}

export function lastDayOfMonth(s: string): string {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  return fromUtc(Date.UTC(y, m, 0));
}

/** Number of days in an inclusive range. */
export function daysInclusive(from: string, to: string): number {
  return nightsBetween(from, to) + 1;
}
