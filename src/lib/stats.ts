import { roundCur } from './currencies';
import { reservationFinance, effectiveRoomStatus, getRate, toBase } from './logic';
import type { AppData, CurrencyCode, Reservation, RoomStatus } from './types';

export interface DashboardStats {
  totalRooms: number;
  byStatus: Record<RoomStatus, number>;
  occupancyRate: number;
  arrivalsToday: Reservation[];
  departuresToday: Reservation[];
  activeReservations: number;
  revenueBase: number;
  expensesBase: number;
  netBase: number;
  outstandingBase: number;
  revenueByCurrency: { currency: CurrencyCode; amount: number }[];
  recentReservations: Reservation[];
}

export function paymentBase(data: AppData, amount: number, rateToBase: number): number {
  return toBase(amount, rateToBase, data.settings);
}

export function computeDashboard(data: AppData, today: string): DashboardStats {
  const byStatus: Record<RoomStatus, number> = { available: 0, occupied: 0, reserved: 0, cleaning: 0, maintenance: 0 };
  for (const room of data.rooms) byStatus[effectiveRoomStatus(room, data.reservations, today)] += 1;
  const totalRooms = data.rooms.length;

  const arrivalsToday = data.reservations.filter((r) => r.status === 'confirmed' && r.checkIn === today);
  const departuresToday = data.reservations.filter((r) => r.status === 'checked_in' && r.checkOut === today);
  const activeReservations = data.reservations.filter((r) => r.status === 'confirmed' || r.status === 'checked_in').length;

  const base = data.settings.baseCurrency;
  const revenueBase = roundCur(
    data.payments.reduce((s, p) => s + paymentBase(data, p.amount, p.rateToBase), 0),
    base,
  );
  const expensesBase = roundCur(
    data.expenses.reduce((s, x) => s + paymentBase(data, x.amount, x.rateToBase), 0),
    base,
  );

  let outstanding = 0;
  for (const r of data.reservations) {
    if (r.status === 'cancelled') continue;
    const fin = reservationFinance(r, data.payments);
    const rate = getRate(data.settings, r.currency);
    if (fin.balance > 0 && rate) outstanding += fin.balance * rate;
  }

  const perCur = new Map<CurrencyCode, number>();
  for (const p of data.payments) perCur.set(p.currency, (perCur.get(p.currency) ?? 0) + p.amount);

  const recentReservations = [...data.reservations]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.number - a.number))
    .slice(0, 6);

  return {
    totalRooms,
    byStatus,
    occupancyRate: totalRooms ? Math.round((byStatus.occupied / totalRooms) * 100) : 0,
    arrivalsToday,
    departuresToday,
    activeReservations,
    revenueBase,
    expensesBase,
    netBase: roundCur(revenueBase - expensesBase, base),
    outstandingBase: roundCur(outstanding, base),
    revenueByCurrency: [...perCur.entries()].map(([currency, amount]) => ({ currency, amount: roundCur(amount, currency) })),
    recentReservations,
  };
}
