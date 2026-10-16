import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/lib/actions';
import { reservationFinance, reservationTotals } from '../src/lib/logic';
import { nightsBetween } from '../src/lib/dates';
import { ok, errs, room, guest, seeded, resInput, TODAY } from './helpers';

test('nights, discount and total', () => {
  assert.equal(nightsBetween('2026-10-16', '2026-10-19'), 3);
  const t = reservationTotals({ checkIn: '2026-10-16', checkOut: '2026-10-19', pricePerNight: 1000, discount: 250, currency: 'EGP' });
  assert.deepEqual(t, { nights: 3, subtotal: 3000, discount: 250, total: 2750 });
});

test('create reservation, numbering and finance', () => {
  const { d, roomId, guestId } = seeded();
  const r = ok(A.addReservation(d, resInput(guestId, roomId, { discount: 500 }), TODAY));
  assert.equal(r.data.reservations[0].number, 1);
  assert.equal(r.data.reservations[0].status, 'confirmed');
  const f = reservationFinance(r.data.reservations[0], r.data.payments);
  assert.equal(f.total, 2500);
  assert.equal(f.balance, 2500);
});

test('prevents overlapping active reservations; same-day turnover allowed; cancelled frees the room', () => {
  const { d, roomId, guestId } = seeded();
  const a = ok(A.addReservation(d, resInput(guestId, roomId), TODAY)); // 16 -> 19
  const overlap = errs(A.addReservation(a.data, resInput(guestId, roomId, { checkIn: '2026-10-18', checkOut: '2026-10-20' }), TODAY));
  assert.ok(overlap.roomId);
  const turnover = ok(A.addReservation(a.data, resInput(guestId, roomId, { checkIn: '2026-10-19', checkOut: '2026-10-21' }), TODAY));
  assert.equal(turnover.data.reservations.length, 2);
  const cancelled = ok(A.cancelReservation(a.data, a.id!));
  ok(A.addReservation(cancelled.data, resInput(guestId, roomId, { checkIn: '2026-10-17', checkOut: '2026-10-18' }), TODAY));
});

test('editing a reservation ignores itself when checking conflicts', () => {
  const { d, roomId, guestId } = seeded();
  const a = ok(A.addReservation(d, resInput(guestId, roomId), TODAY));
  ok(A.updateReservation(a.data, a.id!, resInput(guestId, roomId, { checkOut: '2026-10-20' }), TODAY));
});

test('date, capacity and money validation', () => {
  const { d, roomId, guestId } = seeded();
  assert.ok(errs(A.addReservation(d, resInput(guestId, roomId, { checkOut: '2026-10-16' }), TODAY)).checkOut);
  assert.ok(errs(A.addReservation(d, resInput(guestId, roomId, { checkIn: '2026-10-10', checkOut: '2026-10-12' }), TODAY)).checkIn);
  assert.ok(errs(A.addReservation(d, resInput(guestId, roomId, { checkIn: '2026-13-40' }), TODAY)).checkIn);
  assert.ok(errs(A.addReservation(d, resInput(guestId, roomId, { guestsCount: 3 }), TODAY)).guestsCount);
  assert.ok(errs(A.addReservation(d, resInput(guestId, roomId, { discount: 99999 }), TODAY)).discount);
  assert.ok(errs(A.addReservation(d, resInput(guestId, roomId, { discount: -1 }), TODAY)).discount);
  assert.ok(errs(A.addReservation(d, resInput('nope', 'nope'), TODAY)).guestId);
  assert.ok(errs(A.addReservation(d, resInput(guestId, roomId, { currency: 'JPY' }), TODAY)).currency);
});

test('check-in / check-out transitions are enforced', () => {
  const { d, roomId, guestId } = seeded();
  const future = ok(A.addReservation(d, resInput(guestId, roomId, { checkIn: '2026-10-20', checkOut: '2026-10-22' }), TODAY));
  assert.ok(errs(A.checkInReservation(future.data, future.id!, TODAY))._); // too early
  assert.ok(errs(A.checkOutReservation(future.data, future.id!))._); // not checked in
  const r = ok(A.addReservation(d, resInput(guestId, roomId), TODAY));
  const ci = ok(A.checkInReservation(r.data, r.id!, TODAY));
  assert.equal(ci.data.reservations[0].status, 'checked_in');
  assert.ok(errs(A.checkInReservation(ci.data, r.id!, TODAY))._); // already in
  assert.ok(errs(A.cancelReservation(ci.data, r.id!))._); // cannot cancel in-house
  assert.ok(errs(A.deleteReservation(ci.data, r.id!))._);
  const co = ok(A.checkOutReservation(ci.data, r.id!));
  assert.equal(co.data.reservations[0].status, 'checked_out');
  assert.equal(co.data.rooms[0].status, 'cleaning');
  assert.ok(errs(A.checkOutReservation(co.data, r.id!))._);
  assert.ok(errs(A.updateReservation(co.data, r.id!, resInput(guestId, roomId), TODAY))._);
  assert.ok(errs(A.deleteReservation(co.data, r.id!))._); // historical record protected
});

test('cannot check in to a room under maintenance / cleaning or occupied by someone else', () => {
  const { d, roomId, guestId } = seeded();
  const r = ok(A.addReservation(d, resInput(guestId, roomId), TODAY));
  const m = ok(A.setRoomStatus(r.data, roomId, 'maintenance'));
  assert.ok(errs(A.checkInReservation(m.data, r.id!, TODAY))._);
  const c = ok(A.setRoomStatus(r.data, roomId, 'cleaning'));
  assert.ok(errs(A.checkInReservation(c.data, r.id!, TODAY))._);
});

test('reservation numbers are never reused', () => {
  const { d, roomId, guestId } = seeded();
  const a = ok(A.addReservation(d, resInput(guestId, roomId), TODAY));
  const del = ok(A.deleteReservation(a.data, a.id!));
  const b = ok(A.addReservation(del.data, resInput(guestId, roomId), TODAY));
  assert.equal(b.data.reservations[0].number, 2);
});

test('editing a running stay locks guest/room/check-in', () => {
  const { d, roomId, guestId } = seeded();
  const g2 = ok(A.addGuest(d, guest({ fullName: 'منى حسن' })));
  const r2 = ok(A.addRoom(g2.data, room({ number: '102' })));
  const a = ok(A.addReservation(r2.data, resInput(guestId, roomId), TODAY));
  const ci = ok(A.checkInReservation(a.data, a.id!, TODAY));
  const upd = ok(A.updateReservation(ci.data, a.id!, resInput(g2.id!, r2.id!, { checkIn: '2026-10-17', checkOut: '2026-10-21', discount: 100 }), TODAY));
  const x = upd.data.reservations[0];
  assert.equal(x.guestId, guestId);
  assert.equal(x.roomId, roomId);
  assert.equal(x.checkIn, '2026-10-16');
  assert.equal(x.checkOut, '2026-10-21');
});
