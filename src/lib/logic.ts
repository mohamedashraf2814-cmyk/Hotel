import { nightsBetween, rangesOverlap } from './dates';
import { roundCur } from './currencies';
import type {
  AppData,
  CurrencyCode,
  Payment,
  Reservation,
  Room,
  RoomStatus,
  ServiceOrder,
  Settings,
} from './types';

/** Reservation statuses that hold a room (used for conflict detection). */
export const ACTIVE_STATUSES: Reservation['status'][] = ['confirmed', 'checked_in'];

export function isActive(r: Reservation): boolean {
  return ACTIVE_STATUSES.includes(r.status);
}

// ---------- Currency conversion ----------

export function getRate(settings: Settings, code: CurrencyCode): number | undefined {
  if (code === settings.baseCurrency) return 1;
  return settings.currencies.find((c) => c.code === code)?.rate;
}

/** Converts an amount from one currency to another using rates relative to the base currency. */
export function convertAmount(amount: number, fromRate: number, toRate: number, toCode: CurrencyCode): number {
  if (!toRate) return 0;
  return roundCur((amount * fromRate) / toRate, toCode);
}

export function toBase(amount: number, rateToBase: number, settings: Settings): number {
  return roundCur(amount * rateToBase, settings.baseCurrency);
}

// ---------- Reservation maths ----------

export interface ReservationTotals {
  nights: number;
  subtotal: number;
  discount: number;
  total: number;
}

export function reservationTotals(
  r: Pick<Reservation, 'checkIn' | 'checkOut' | 'pricePerNight' | 'discount' | 'currency'>,
): ReservationTotals {
  const nights = Math.max(0, nightsBetween(r.checkIn, r.checkOut));
  const subtotal = roundCur(nights * r.pricePerNight, r.currency);
  const discount = Math.min(roundCur(r.discount || 0, r.currency), subtotal);
  const total = roundCur(Math.max(0, subtotal - discount), r.currency);
  return { nights, subtotal, discount, total };
}

export function paymentsOf(payments: Payment[], reservationId: string): Payment[] {
  return payments.filter((p) => p.reservationId === reservationId);
}

// ---------- Spa / restaurant orders ----------

export interface OrderTotals {
  subtotal: number;
  discount: number;
  total: number;
}

export function orderTotals(o: Pick<ServiceOrder, 'lines' | 'discount' | 'currency'>): OrderTotals {
  const subtotal = roundCur(
    o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    o.currency,
  );
  const discount = Math.min(roundCur(o.discount || 0, o.currency), subtotal);
  return { subtotal, discount, total: roundCur(Math.max(0, subtotal - discount), o.currency) };
}

/** Orders charged to a reservation's folio (cancelled orders excluded). */
export function roomChargesOf(orders: ServiceOrder[], reservationId: string): ServiceOrder[] {
  return orders.filter((o) => o.billing === 'room' && o.reservationId === reservationId && o.status !== 'cancelled');
}

export interface ReservationFinance extends ReservationTotals {
  /** Room total (nights × price − discount). */
  roomTotal: number;
  /** Spa & restaurant charges posted to the room. */
  extras: number;
  paid: number;
  balance: number;
}

/** Folio of a reservation: room + room-charged services, minus payments. `total` is the grand total. */
export function reservationFinance(r: Reservation, payments: Payment[], orders: ServiceOrder[] = []): ReservationFinance {
  const t = reservationTotals(r);
  const extras = roundCur(
    roomChargesOf(orders, r.id).reduce((s, o) => s + orderTotals(o).total, 0),
    r.currency,
  );
  const total = roundCur(t.total + extras, r.currency);
  const paid = roundCur(
    paymentsOf(payments, r.id).reduce((s, p) => s + p.appliedAmount, 0),
    r.currency,
  );
  const balance = roundCur(total - paid, r.currency);
  return { ...t, roomTotal: t.total, extras, total, paid, balance };
}

// ---------- Conflicts & room status ----------

export function findConflict(
  reservations: Reservation[],
  q: { roomId: string; checkIn: string; checkOut: string; excludeId?: string },
): Reservation | undefined {
  return reservations.find(
    (r) =>
      r.id !== q.excludeId &&
      r.roomId === q.roomId &&
      isActive(r) &&
      rangesOverlap(q.checkIn, q.checkOut, r.checkIn, r.checkOut),
  );
}

/**
 * Effective room status shown in the UI:
 *  - a checked-in guest => occupied
 *  - maintenance / cleaning (manual) => as stored
 *  - a confirmed reservation covering today => reserved
 *  - otherwise available
 */
export function effectiveRoomStatus(room: Room, reservations: Reservation[], today: string): RoomStatus {
  const mine = reservations.filter((r) => r.roomId === room.id);
  if (mine.some((r) => r.status === 'checked_in')) return 'occupied';
  if (room.status === 'maintenance') return 'maintenance';
  if (room.status === 'cleaning') return 'cleaning';
  if (mine.some((r) => r.status === 'confirmed' && r.checkIn <= today && today < r.checkOut)) return 'reserved';
  return 'available';
}

export function currentReservationOfRoom(room: Room, reservations: Reservation[]): Reservation | undefined {
  return reservations.find((r) => r.roomId === room.id && r.status === 'checked_in');
}

// ---------- Lookups ----------

export function roomById(data: AppData, id: string): Room | undefined {
  return data.rooms.find((r) => r.id === id);
}

export function guestById(data: AppData, id: string) {
  return data.guests.find((g) => g.id === id);
}

export function reservationById(data: AppData, id: string): Reservation | undefined {
  return data.reservations.find((r) => r.id === id);
}

export function reservationLabel(r: Reservation): string {
  return `#${String(r.number).padStart(4, '0')}`;
}

// ---------- Status transitions ----------

export type Check = { ok: true } | { ok: false; error: string };

export function canCheckIn(data: AppData, r: Reservation, today: string): Check {
  if (r.status !== 'confirmed') return { ok: false, error: 'لا يمكن تسجيل الوصول إلا لحجز مؤكد.' };
  if (today < r.checkIn) return { ok: false, error: 'لم يحن موعد الوصول بعد. لا يمكن تسجيل الوصول قبل تاريخ الدخول.' };
  if (today >= r.checkOut) return { ok: false, error: 'انتهت فترة هذا الحجز. عدّل تواريخ الحجز أولًا.' };
  const room = roomById(data, r.roomId);
  if (!room) return { ok: false, error: 'الغرفة المرتبطة بالحجز غير موجودة.' };
  if (room.status === 'maintenance') return { ok: false, error: 'الغرفة تحت الصيانة ولا يمكن تسكين نزيل فيها.' };
  if (room.status === 'cleaning') return { ok: false, error: 'الغرفة قيد التنظيف. غيّر حالتها إلى «متاحة» بعد الانتهاء.' };
  const other = data.reservations.find((x) => x.id !== r.id && x.roomId === r.roomId && x.status === 'checked_in');
  if (other) return { ok: false, error: 'يوجد نزيل مسجل حاليًا في هذه الغرفة. يجب تسجيل مغادرته أولًا.' };
  return { ok: true };
}

export function canCheckOut(r: Reservation): Check {
  if (r.status !== 'checked_in') return { ok: false, error: 'لا يمكن تسجيل المغادرة إلا لنزيل مسجّل الوصول.' };
  return { ok: true };
}

export function canCancel(r: Reservation): Check {
  if (r.status === 'confirmed') return { ok: true };
  if (r.status === 'checked_in') return { ok: false, error: 'النزيل داخل الفندق. سجّل المغادرة بدلًا من الإلغاء.' };
  if (r.status === 'cancelled') return { ok: false, error: 'الحجز ملغي بالفعل.' };
  return { ok: false, error: 'لا يمكن إلغاء حجز انتهت إقامته.' };
}
