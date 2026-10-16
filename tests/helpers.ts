import assert from 'node:assert/strict';
import * as A from '../src/lib/actions';
import { emptyData } from '../src/lib/defaults';
import type { ActionResult, AppData } from '../src/lib/types';

export function ok(r: ActionResult): { data: AppData; id?: string } {
  assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r));
  if (!r.ok) throw new Error('unreachable');
  return r;
}

export function errs(r: ActionResult): Record<string, string> {
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('unreachable');
  return r.errors ?? { _: r.error ?? '' };
}

export const room = (o: Partial<A.RoomInput> = {}): A.RoomInput => ({
  number: '101', type: 'double', floor: 1, capacity: 2, pricePerNight: 1000, currency: 'EGP',
  status: 'available', description: '', ...o,
});

export const guest = (o: Partial<A.GuestInput> = {}): A.GuestInput => ({
  fullName: 'أحمد محمد', phone: '01012345678', email: '', nationality: 'مصري',
  idType: '', idNumber: '', address: '', notes: '', ...o,
});

export const TODAY = '2026-10-16';

/** system with USD enabled (1 USD = 50 EGP), one room, one guest */
export function seeded() {
  let d = emptyData();
  d = ok(
    A.updateSettings(d, {
      ...d.settings,
      currencies: [{ code: 'EGP', rate: 1 }, { code: 'USD', rate: 50 }, { code: 'SAR', rate: 13.33 }],
    }),
  ).data;
  const r1 = ok(A.addRoom(d, room()));
  d = r1.data;
  const g1 = ok(A.addGuest(d, guest()));
  d = g1.data;
  return { d, roomId: r1.id!, guestId: g1.id! };
}

export const resInput = (guestId: string, roomId: string, o: Partial<A.ReservationInput> = {}): A.ReservationInput => ({
  guestId, roomId, checkIn: '2026-10-16', checkOut: '2026-10-19', guestsCount: 2,
  currency: 'EGP', pricePerNight: 1000, discount: 0, notes: '', ...o,
});
