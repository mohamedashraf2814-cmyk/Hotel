import { currencyInfo, roundCur } from './currencies';
import { addDays, daysInclusive } from './dates';
import { reservationFinance, toBase } from './logic';
import { directOrderRevenueBase, orderLabel } from './services';
import { orderTotals } from './logic';
import type { AppData, CurrencyCode, Department, Expense, ExpenseCategory, Payment, PaymentMethod, Reservation, Room } from './types';

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
      const f = reservationFinance(r, data.payments, data.orders);
      return { reservation: r, nights: f.nights, total: f.total, paid: f.paid, balance: f.balance };
    });
  const byStatus: Record<Reservation['status'], number> = { confirmed: 0, checked_in: 0, checked_out: 0, cancelled: 0 };
  rows.forEach((x) => (byStatus[x.reservation.status] += 1));
  return { rows, byStatus };
}

// ----- revenue -----
/** One revenue entry: a reservation payment or a settled walk-in spa/restaurant order. */
export interface RevenueEntry {
  id: string;
  date: string;
  source: 'reservation' | Department;
  ref: string;
  reservationId: string;
  customer: string;
  method: PaymentMethod;
  amount: number;
  currency: CurrencyCode;
  rateToBase: number;
  base: number;
  reference: string;
}

export interface RevenueReport {
  payments: Payment[];
  entries: RevenueEntry[];
  bySource: { source: 'reservation' | Department; base: number; count: number }[];
  totalBase: number;
  byMethod: { method: PaymentMethod; base: number; count: number }[];
  byCurrency: { currency: CurrencyCode; amount: number; base: number }[];
}
export function revenueReport(data: AppData, range: DateRange): RevenueReport {
  const payments = data.payments
    .filter((p) => p.date >= range.from && p.date <= range.to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
  const base = data.settings.baseCurrency;
  const entries: RevenueEntry[] = payments.map((p) => {
    const r = data.reservations.find((x) => x.id === p.reservationId);
    return {
      id: p.id,
      date: p.date,
      source: 'reservation',
      ref: r ? `#${String(r.number).padStart(4, '0')}` : '',
      reservationId: p.reservationId,
      customer: r ? (data.guests.find((g) => g.id === r.guestId)?.fullName ?? '') : '',
      method: p.method,
      amount: p.amount,
      currency: p.currency,
      rateToBase: p.rateToBase,
      base: toBase(p.amount, p.rateToBase, data.settings),
      reference: p.reference,
    };
  });
  for (const o of data.orders) {
    if (o.date < range.from || o.date > range.to) continue;
    const b = directOrderRevenueBase(data, o);
    if (!b) continue;
    entries.push({
      id: o.id,
      date: o.date,
      source: o.department,
      ref: orderLabel(o),
      reservationId: '',
      customer: o.customerName,
      method: o.method,
      amount: orderTotals(o).total,
      currency: o.currency,
      rateToBase: o.rateToBase,
      base: b,
      reference: '',
    });
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const m = new Map<PaymentMethod, { base: number; count: number }>();
  const c = new Map<CurrencyCode, { amount: number; base: number }>();
  const src = new Map<RevenueEntry['source'], { base: number; count: number }>();
  let total = 0;
  for (const e of entries) {
    total += e.base;
    const mm = m.get(e.method) ?? { base: 0, count: 0 };
    m.set(e.method, { base: mm.base + e.base, count: mm.count + 1 });
    const cc = c.get(e.currency) ?? { amount: 0, base: 0 };
    c.set(e.currency, { amount: cc.amount + e.amount, base: cc.base + e.base });
    const ss = src.get(e.source) ?? { base: 0, count: 0 };
    src.set(e.source, { base: ss.base + e.base, count: ss.count + 1 });
  }
  return {
    payments,
    entries,
    bySource: [...src.entries()].map(([source, v]) => ({ source, base: roundCur(v.base, base), count: v.count })),
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
