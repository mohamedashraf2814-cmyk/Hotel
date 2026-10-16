import { currencyInfo, roundCur } from './currencies';
import { addDays, daysInclusive } from './dates';
import { reservationFinance, toBase } from './logic';
import type { AppData, CurrencyCode, Expense, ExpenseCategory, Payment, PaymentMethod, Reservation, Room } from './types';

export interface DateRange {
  from: string;
  to: string;
}

// ----- occupancy -----
export interface OccupancyRow {
  room: Room;
  occupiedNights: number;
  availableNights: number;
  ratePct: number;
}
export interface OccupancyReport {
  days: number;
  rows: OccupancyRow[];
  totalOccupied: number;
  totalAvailable: number;
  overallPct: number;
}

function overlapNights(r: Reservation, range: DateRange): number {
  // stay nights are [checkIn, checkOut); the report covers [from, to + 1 day)
  const end = addDays(range.to, 1);
  const s = r.checkIn > range.from ? r.checkIn : range.from;
  const e = r.checkOut < end ? r.checkOut : end;
  if (s >= e) return 0;
  return daysInclusive(s, addDays(e, -1));
}

export function occupancyReport(data: AppData, range: DateRange): OccupancyReport {
  const days = Math.max(0, daysInclusive(range.from, range.to));
  const rows: OccupancyRow[] = data.rooms
    .map((room) => {
      const nights = data.reservations
        .filter((r) => r.roomId === room.id && r.status !== 'cancelled')
        .reduce((s, r) => s + overlapNights(r, range), 0);
      const occupiedNights = Math.min(nights, days);
      return { room, occupiedNights, availableNights: days, ratePct: days ? Math.round((occupiedNights / days) * 1000) / 10 : 0 };
    })
    .sort((a, b) => a.room.number.localeCompare(b.room.number, 'ar', { numeric: true }));
  const totalOccupied = rows.reduce((s, r) => s + r.occupiedNights, 0);
  const totalAvailable = rows.reduce((s, r) => s + r.availableNights, 0);
  return {
    days,
    rows,
    totalOccupied,
    totalAvailable,
    overallPct: totalAvailable ? Math.round((totalOccupied / totalAvailable) * 1000) / 10 : 0,
  };
}

// ----- reservations -----
export interface ReservationReportRow {
  reservation: Reservation;
  nights: number;
  total: number;
  paid: number;
  balance: number;
}
export function reservationsReport(data: AppData, range: DateRange, status?: Reservation['status']) {
  const end = addDays(range.to, 1);
  const rows: ReservationReportRow[] = data.reservations
    .filter((r) => r.checkIn < end && r.checkOut > range.from && (!status || r.status === status))
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.number - b.number))
    .map((r) => {
      const f = reservationFinance(r, data.payments);
      return { reservation: r, nights: f.nights, total: f.total, paid: f.paid, balance: f.balance };
    });
  const byStatus: Record<Reservation['status'], number> = { confirmed: 0, checked_in: 0, checked_out: 0, cancelled: 0 };
  rows.forEach((x) => (byStatus[x.reservation.status] += 1));
  return { rows, byStatus };
}

// ----- revenue -----
export interface RevenueReport {
  payments: Payment[];
  totalBase: number;
  byMethod: { method: PaymentMethod; base: number; count: number }[];
  byCurrency: { currency: CurrencyCode; amount: number; base: number }[];
}
export function revenueReport(data: AppData, range: DateRange): RevenueReport {
  const payments = data.payments
    .filter((p) => p.date >= range.from && p.date <= range.to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
  const base = data.settings.baseCurrency;
  const m = new Map<PaymentMethod, { base: number; count: number }>();
  const c = new Map<CurrencyCode, { amount: number; base: number }>();
  let total = 0;
  for (const p of payments) {
    const b = toBase(p.amount, p.rateToBase, data.settings);
    total += b;
    const mm = m.get(p.method) ?? { base: 0, count: 0 };
    m.set(p.method, { base: mm.base + b, count: mm.count + 1 });
    const cc = c.get(p.currency) ?? { amount: 0, base: 0 };
    c.set(p.currency, { amount: cc.amount + p.amount, base: cc.base + b });
  }
  return {
    payments,
    totalBase: roundCur(total, base),
    byMethod: [...m.entries()].map(([method, v]) => ({ method, base: roundCur(v.base, base), count: v.count })),
    byCurrency: [...c.entries()].map(([currency, v]) => ({
      currency,
      amount: roundCur(v.amount, currency),
      base: roundCur(v.base, base),
    })),
  };
}

// ----- expenses -----
export interface ExpensesReport {
  expenses: Expense[];
  totalBase: number;
  byCategory: { category: ExpenseCategory; base: number; count: number }[];
  byCurrency: { currency: CurrencyCode; amount: number; base: number }[];
}
export function expensesReport(data: AppData, range: DateRange): ExpensesReport {
  const expenses = data.expenses
    .filter((x) => x.date >= range.from && x.date <= range.to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
  const base = data.settings.baseCurrency;
  const cat = new Map<ExpenseCategory, { base: number; count: number }>();
  const cur = new Map<CurrencyCode, { amount: number; base: number }>();
  let total = 0;
  for (const x of expenses) {
    const b = toBase(x.amount, x.rateToBase, data.settings);
    total += b;
    const a = cat.get(x.category) ?? { base: 0, count: 0 };
    cat.set(x.category, { base: a.base + b, count: a.count + 1 });
    const cc = cur.get(x.currency) ?? { amount: 0, base: 0 };
    cur.set(x.currency, { amount: cc.amount + x.amount, base: cc.base + b });
  }
  return {
    expenses,
    totalBase: roundCur(total, base),
    byCategory: [...cat.entries()].map(([category, v]) => ({ category, base: roundCur(v.base, base), count: v.count })),
    byCurrency: [...cur.entries()].map(([currency, v]) => ({
      currency,
      amount: roundCur(v.amount, currency),
      base: roundCur(v.base, base),
    })),
  };
}

export function symbolOf(code: CurrencyCode): string {
  return currencyInfo(code).symbol;
}
