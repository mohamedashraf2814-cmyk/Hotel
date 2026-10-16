import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/lib/actions';
import { emptyData } from '../src/lib/defaults';
import { effectiveRoomStatus } from '../src/lib/logic';
import { ok, errs, room, guest, seeded, resInput, TODAY } from './helpers';

test('system starts empty (no demo data)', () => {
  const d = emptyData();
  assert.equal(d.rooms.length + d.guests.length + d.reservations.length + d.payments.length + d.expenses.length, 0);
});

test('add / edit / delete room', () => {
  let d = emptyData();
  const a = ok(A.addRoom(d, room()));
  d = a.data;
  assert.equal(d.rooms.length, 1);
  d = ok(A.updateRoom(d, a.id!, room({ pricePerNight: 1500, floor: 2 }))).data;
  assert.equal(d.rooms[0].pricePerNight, 1500);
  d = ok(A.deleteRoom(d, a.id!)).data;
  assert.equal(d.rooms.length, 0);
});

test('duplicate room numbers are rejected (case/space-insensitive), but editing itself is fine', () => {
  let d = emptyData();
  const a = ok(A.addRoom(d, room({ number: 'A1' })));
  d = a.data;
  assert.ok(errs(A.addRoom(d, room({ number: ' a1 ' }))).number);
  ok(A.updateRoom(d, a.id!, room({ number: 'A1', floor: 3 })));
});

test('room validation messages', () => {
  const d = emptyData();
  const e = errs(A.addRoom(d, room({ number: '', capacity: 0, pricePerNight: -1, floor: 1.5, currency: 'USD' })));
  assert.ok(e.number && e.capacity && e.pricePerNight && e.floor && e.currency);
});

test('cannot delete a room that has reservations', () => {
  const { d, roomId, guestId } = seeded();
  const r = ok(A.addReservation(d, resInput(guestId, roomId), TODAY));
  assert.ok(errs(A.deleteRoom(r.data, roomId))._);
});

test('guest validation and delete protection', () => {
  const { d, roomId, guestId } = seeded();
  const e = errs(A.addGuest(d, guest({ fullName: '', phone: 'abc', email: 'x', idType: 'passport', idNumber: '' })));
  assert.ok(e.fullName && e.phone && e.email && e.idNumber);
  const r = ok(A.addReservation(d, resInput(guestId, roomId), TODAY));
  assert.ok(errs(A.deleteGuest(r.data, guestId))._);
  const g2 = ok(A.addGuest(d, guest({ fullName: 'سارة علي' })));
  assert.equal(ok(A.deleteGuest(g2.data, g2.id!)).data.guests.length, 1);
});

test('effective room status follows reservations and manual status', () => {
  const { d, roomId, guestId } = seeded();
  const room0 = d.rooms[0];
  assert.equal(effectiveRoomStatus(room0, d.reservations, TODAY), 'available');
  const r = ok(A.addReservation(d, resInput(guestId, roomId), TODAY));
  assert.equal(effectiveRoomStatus(r.data.rooms[0], r.data.reservations, TODAY), 'reserved');
  const ci = ok(A.checkInReservation(r.data, r.id!, TODAY));
  assert.equal(effectiveRoomStatus(ci.data.rooms[0], ci.data.reservations, TODAY), 'occupied');
  const co = ok(A.checkOutReservation(ci.data, r.id!));
  assert.equal(effectiveRoomStatus(co.data.rooms[0], co.data.reservations, TODAY), 'cleaning');
  const clean = ok(A.setRoomStatus(co.data, roomId, 'available'));
  assert.equal(effectiveRoomStatus(clean.data.rooms[0], clean.data.reservations, TODAY), 'available');
  const m = ok(A.setRoomStatus(clean.data, roomId, 'maintenance'));
  assert.equal(effectiveRoomStatus(m.data.rooms[0], m.data.reservations, TODAY), 'maintenance');
});

test('cannot put an occupied room into maintenance', () => {
  const { d, roomId, guestId } = seeded();
  const r = ok(A.addReservation(d, resInput(guestId, roomId), TODAY));
  const ci = ok(A.checkInReservation(r.data, r.id!, TODAY));
  assert.ok(errs(A.setRoomStatus(ci.data, roomId, 'maintenance'))._);
  assert.ok(errs(A.updateRoom(ci.data, roomId, room({ status: 'cleaning' }))).status);
});
