import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/lib/actions';
import * as S from '../src/lib/services';
import { buildBackup, parseBackup } from '../src/lib/backup';
import { reservationFinance } from '../src/lib/logic';
import { computeDashboard } from '../src/lib/stats';
import { revenueReport } from '../src/lib/reports';
import type { AppData } from '../src/lib/types';
import { ok, errs, seeded, resInput, TODAY } from './helpers';

const spaItem = (o: Partial<S.ServiceItemInput> = {}): S.ServiceItemInput => ({
  department: 'spa', name: 'مساج سويدي', category: 'مساج', price: 800, currency: 'EGP', durationMin: 60, description: '', active: true, ...o,
});
const food = (o: Partial<S.ServiceItemInput> = {}): S.ServiceItemInput => ({
  department: 'restaurant', name: 'مشويات مشكلة', category: 'مشويات', price: 10, currency: 'USD', durationMin: 0, description: '', active: true, ...o,
});
const order = (o: Partial<S.OrderInput> = {}): S.OrderInput => ({
  department: 'restaurant', date: TODAY, time: '13:30', billing: 'direct', reservationId: '', customerName: 'زائر',
  place: 'طاولة 4', lines: [], currency: 'EGP', discount: 0, method: 'cash', rateToBase: 1, notes: '', ...o,
});

function setup() {
  const { d, roomId, guestId } = seeded(); // EGP base, USD = 50, SAR = 13.33
  let x: AppData = ok(A.addReservation(d, resInput(guestId, roomId), TODAY)).data; // 3 nights x 1000 = 3000 EGP
  const resId = x.reservations[0].id;
  const spa = ok(S.addServiceItem(x, spaItem()));
  x = spa.data;
  const meal = ok(S.addServiceItem(x, food()));
  x = meal.data;
  return { x, resId, spaId: spa.id!, mealId: meal.id! };
}

test('catalogue CRUD, duplicate names, spa duration, delete protection', () => {
  const { x, spaId, mealId } = setup();
  assert.ok(errs(S.addServiceItem(x, spaItem())).name); // duplicate in same department
  ok(S.addServiceItem(x, food({ name: 'مساج سويدي' }))); // same name in another department is fine
  assert.ok(errs(S.addServiceItem(x, spaItem({ name: 'x', durationMin: 0 }))).durationMin);
  assert.ok(errs(S.addServiceItem(x, spaItem({ name: 'y', price: 0, currency: 'JPY' }))).price);
  const off = ok(S.setServiceItemActive(x, spaId, false));
  assert.equal(off.data.serviceItems.find((i) => i.id === spaId)!.active, false);
  const used = ok(S.addOrder(x, order({ lines: [{ itemId: mealId, qty: 1 }] }), TODAY));
  assert.ok(errs(S.deleteServiceItem(used.data, mealId))._);
  assert.equal(ok(S.deleteServiceItem(x, mealId)).data.serviceItems.length, 1);
});

test('walk-in restaurant order: currency conversion, settle, revenue', () => {
  const { x, mealId } = setup();
  // meal is 10 USD; order in EGP => 500 EGP each
  const o = ok(S.addOrder(x, order({ lines: [{ itemId: mealId, qty: 2 }], discount: 100 }), TODAY));
  const ord = o.data.orders[0];
  assert.equal(ord.lines[0].unitPrice, 500);
  assert.equal(ord.number, 1);
  assert.equal(S.orderLabel(ord), 'R-0001');
  // not revenue until served & settled
  assert.equal(computeDashboard(o.data, TODAY).revenueBase, 0);
  const done = ok(S.completeOrder(o.data, o.id!, { method: 'card', rateToBase: 1 }));
  const dash = computeDashboard(done.data, TODAY);
  assert.equal(dash.revenueBase, 900);
  assert.equal(dash.restaurantSalesToday, 900);
  const rev = revenueReport(done.data, { from: TODAY, to: TODAY });
  assert.equal(rev.totalBase, 900);
  assert.deepEqual(rev.bySource.map((b) => [b.source, b.base]), [['restaurant', 900]]);
  assert.ok(errs(S.deleteOrder(done.data, o.id!))._); // completed = financial record
  assert.ok(errs(S.updateOrder(done.data, o.id!, order({ lines: [{ itemId: mealId, qty: 1 }] }), TODAY))._);
});

test('walk-in order paid in USD keeps its own rate snapshot', () => {
  const { x, mealId } = setup();
  const o = ok(S.addOrder(x, order({ currency: 'USD', rateToBase: 48, lines: [{ itemId: mealId, qty: 3 }] }), TODAY));
  assert.equal(o.data.orders[0].lines[0].unitPrice, 10);
  const done = ok(S.completeOrder(o.data, o.id!));
  assert.equal(computeDashboard(done.data, TODAY).revenueBase, 30 * 48);
});

test('room charge: posted to folio, paid with reservation payments', () => {
  const { x, resId, spaId, mealId } = setup();
  const spaAppt = ok(S.addOrder(x, order({ department: 'spa', billing: 'room', reservationId: resId, time: '17:00', place: 'سارة', lines: [{ itemId: spaId, qty: 1 }] }), TODAY));
  let d = spaAppt.data;
  assert.equal(d.orders[0].currency, 'EGP');
  d = ok(S.addOrder(d, order({ billing: 'room', reservationId: resId, lines: [{ itemId: mealId, qty: 1 }] }), TODAY)).data; // 500 EGP
  const fin = reservationFinance(d.reservations[0], d.payments, d.orders);
  assert.deepEqual([fin.roomTotal, fin.extras, fin.total, fin.balance], [3000, 1300, 4300, 4300]);
  // room charges are NOT revenue until the guest pays
  assert.equal(computeDashboard(d, TODAY).revenueBase, 0);
  assert.equal(computeDashboard(d, TODAY).outstandingBase, 4300);
  assert.equal(computeDashboard(d, TODAY).spaToday.length, 1);
  // payment can now cover the full folio
  d = ok(A.addPayment(d, { reservationId: resId, date: TODAY, amount: 4300, currency: 'EGP', rateToBase: 1, method: 'cash', reference: '', notes: '' }, TODAY)).data;
  assert.equal(reservationFinance(d.reservations[0], d.payments, d.orders).balance, 0);
  // cancelling a paid room charge would leave payments above total => blocked
  assert.ok(errs(S.cancelOrder(d, spaAppt.id!))._);
});

test('room charge validation: date within stay, active reservation, cancel/delete reservation guarded', () => {
  const { x, resId, mealId } = setup();
  assert.ok(errs(S.addOrder(x, order({ billing: 'room', reservationId: resId, date: '2026-12-01', lines: [{ itemId: mealId, qty: 1 }] }), TODAY)).date);
  assert.ok(errs(S.addOrder(x, order({ billing: 'room', reservationId: '', lines: [{ itemId: mealId, qty: 1 }] }), TODAY)).reservationId);
  assert.ok(errs(S.addOrder(x, order({ customerName: '', lines: [{ itemId: mealId, qty: 1 }] }), TODAY)).customerName);
  assert.ok(errs(S.addOrder(x, order({ lines: [] }), TODAY)).lines);
  assert.ok(errs(S.addOrder(x, order({ lines: [{ itemId: mealId, qty: 0 }] }), TODAY)).lines);
  assert.ok(errs(S.addOrder(x, order({ time: '25:00', lines: [{ itemId: mealId, qty: 1 }] }), TODAY)).time);
  assert.ok(errs(S.addOrder(x, order({ discount: 99999, lines: [{ itemId: mealId, qty: 1 }] }), TODAY)).discount);
  const charged = ok(S.addOrder(x, order({ billing: 'room', reservationId: resId, lines: [{ itemId: mealId, qty: 1 }] }), TODAY));
  assert.ok(errs(A.cancelReservation(charged.data, resId))._);
  assert.ok(errs(A.deleteReservation(charged.data, resId))._);
  const cancelled = ok(S.cancelOrder(charged.data, charged.id!));
  assert.equal(reservationFinance(cancelled.data.reservations[0], cancelled.data.payments, cancelled.data.orders).extras, 0);
  ok(A.cancelReservation(cancelled.data, resId));
});

test('spa appointment cannot be in the past; inactive items cannot be ordered', () => {
  const { x, spaId } = setup();
  assert.ok(errs(S.addOrder(x, order({ department: 'spa', date: '2026-01-01', lines: [{ itemId: spaId, qty: 1 }] }), TODAY)).date);
  const off = ok(S.setServiceItemActive(x, spaId, false));
  assert.ok(errs(S.addOrder(off.data, order({ department: 'spa', lines: [{ itemId: spaId, qty: 1 }] }), TODAY)).lines);
});

test('backup round-trip with spa/restaurant data, and old backups without them still import', () => {
  const { x, mealId, resId } = setup();
  let d = ok(S.addOrder(x, order({ lines: [{ itemId: mealId, qty: 2 }] }), TODAY)).data;
  d = ok(S.addOrder(d, order({ billing: 'room', reservationId: resId, lines: [{ itemId: mealId, qty: 1 }] }), TODAY)).data;
  const parsed = parseBackup(buildBackup(d));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.data, d);
  const old = JSON.parse(buildBackup(d));
  delete old.data.serviceItems;
  delete old.data.orders;
  old.data.counters = { reservation: 1 };
  old.data.settings.hotelName = 'فندقي';
  const p2 = parseBackup(JSON.stringify(old));
  assert.equal(p2.ok, true);
  if (p2.ok) {
    assert.deepEqual([p2.data.serviceItems.length, p2.data.orders.length, p2.data.counters.order], [0, 0, 0]);
    assert.equal(p2.data.settings.hotelName, 'Merak');
  }
  const broken = JSON.parse(buildBackup(d));
  broken.data.orders[0].lines[0].itemId = 'ghost';
  assert.equal(parseBackup(JSON.stringify(broken)).ok, false);
});

test('cannot remove a currency used by the menu', () => {
  const { x } = setup();
  assert.ok(errs(A.updateSettings(x, { ...x.settings, currencies: [{ code: 'EGP', rate: 1 }, { code: 'SAR', rate: 13.33 }] })).currencies);
});
