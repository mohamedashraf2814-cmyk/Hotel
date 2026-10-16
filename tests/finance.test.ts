import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/lib/actions';
import { reservationFinance } from '../src/lib/logic';
import { computeDashboard } from '../src/lib/stats';
import { expensesReport, occupancyReport, revenueReport, reservationsReport } from '../src/lib/reports';
import { ok, errs, seeded, resInput, TODAY } from './helpers';

function withReservation() {
  const { d, roomId, guestId } = seeded();
  const r = ok(A.addReservation(d, resInput(guestId, roomId), TODAY)); // 3 nights x 1000 EGP = 3000
  return { d: r.data, resId: r.id!, roomId, guestId };
}
const pay = (resId: string, o: Partial<A.PaymentInput> = {}): A.PaymentInput => ({
  reservationId: resId, date: TODAY, amount: 1000, currency: 'EGP', rateToBase: 1,
  method: 'cash', reference: '', notes: '', ...o,
});

test('same-currency payments reduce the balance', () => {
  const { d, resId } = withReservation();
  const p = ok(A.addPayment(d, pay(resId, { amount: 1200 }), TODAY));
  const f = reservationFinance(p.data.reservations[0], p.data.payments);
  assert.deepEqual([f.total, f.paid, f.balance], [3000, 1200, 1800]);
});

test('multi-currency payment is converted into the reservation currency', () => {
  const { d, resId } = withReservation();
  // 20 USD at 50 EGP/USD = 1000 EGP
  const p = ok(A.addPayment(d, pay(resId, { amount: 20, currency: 'USD', rateToBase: 50 }), TODAY));
  assert.equal(p.data.payments[0].appliedAmount, 1000);
  assert.equal(reservationFinance(p.data.reservations[0], p.data.payments).balance, 2000);
});

test('USD-priced reservation paid in EGP', () => {
  const { d, roomId, guestId } = seeded();
  const r = ok(A.addReservation(d, resInput(guestId, roomId, { currency: 'USD', pricePerNight: 40 }), TODAY)); // 120 USD
  const p = ok(A.addPayment(r.data, pay(r.id!, { amount: 2500, currency: 'EGP', rateToBase: 1 }), TODAY)); // 50 USD
  assert.equal(p.data.payments[0].appliedAmount, 50);
  assert.equal(reservationFinance(p.data.reservations[0], p.data.payments).balance, 70);
});

test('overpayment, bad amount, future date, cancelled reservation are rejected', () => {
  const { d, resId } = withReservation();
  assert.ok(errs(A.addPayment(d, pay(resId, { amount: 3001 }), TODAY)).amount);
  assert.ok(errs(A.addPayment(d, pay(resId, { amount: 0 }), TODAY)).amount);
  assert.ok(errs(A.addPayment(d, pay(resId, { date: '2026-12-01' }), TODAY)).date);
  assert.ok(errs(A.addPayment(d, pay(resId, { currency: 'USD', amount: 100, rateToBase: 50 }), TODAY)).amount); // 5000 EGP > 3000
  assert.ok(errs(A.addPayment(d, pay(resId, { rateToBase: 2 }), TODAY)).rateToBase); // base must be 1
  const c = ok(A.cancelReservation(d, resId));
  assert.ok(errs(A.addPayment(c.data, pay(resId), TODAY)).reservationId);
  const full = ok(A.addPayment(d, pay(resId, { amount: 3000 }), TODAY));
  assert.equal(reservationFinance(full.data.reservations[0], full.data.payments).balance, 0);
  assert.ok(errs(A.addPayment(full.data, pay(resId, { amount: 1 }), TODAY)).amount);
});

test('edit and delete payment keep balances consistent; reservations with payments are protected', () => {
  const { d, resId } = withReservation();
  const p = ok(A.addPayment(d, pay(resId, { amount: 1000 }), TODAY));
  const e = ok(A.updatePayment(p.data, p.id!, pay(resId, { amount: 3000 }), TODAY));
  assert.equal(reservationFinance(e.data.reservations[0], e.data.payments).balance, 0);
  assert.ok(errs(A.deleteReservation(e.data, resId))._);
  const del = ok(A.deletePayment(e.data, p.id!));
  assert.equal(reservationFinance(del.data.reservations[0], del.data.payments).balance, 3000);
});

test('cannot change reservation currency after payments, nor lower total below paid', () => {
  const { d, resId, roomId, guestId } = withReservation();
  const p = ok(A.addPayment(d, pay(resId, { amount: 2500 }), TODAY));
  assert.ok(errs(A.updateReservation(p.data, resId, resInput(guestId, roomId, { currency: 'USD' }), TODAY)).currency);
  assert.ok(errs(A.updateReservation(p.data, resId, resInput(guestId, roomId, { discount: 1000 }), TODAY)).discount);
});

test('expenses CRUD and validation', () => {
  let { d } = seeded();
  const input: A.ExpenseInput = { category: 'utilities', amount: 100, currency: 'USD', rateToBase: 50, date: TODAY, description: 'كهرباء' };
  const a = ok(A.addExpense(d, input, TODAY));
  d = a.data;
  assert.ok(errs(A.addExpense(d, { ...input, amount: 0, description: '' }, TODAY)).amount);
  d = ok(A.updateExpense(d, a.id!, { ...input, amount: 200 }, TODAY)).data;
  assert.equal(d.expenses[0].amount, 200);
  d = ok(A.deleteExpense(d, a.id!)).data;
  assert.equal(d.expenses.length, 0);
});

test('dashboard metrics are computed from saved data', () => {
  let { d, resId, roomId, guestId } = withReservation();
  const dash0 = computeDashboard(d, TODAY);
  assert.equal(dash0.totalRooms, 1);
  assert.equal(dash0.byStatus.reserved, 1);
  assert.equal(dash0.arrivalsToday.length, 1);
  assert.equal(dash0.activeReservations, 1);
  assert.equal(dash0.outstandingBase, 3000);
  d = ok(A.addPayment(d, pay(resId, { amount: 20, currency: 'USD', rateToBase: 50 }), TODAY)).data; // 1000 EGP
  d = ok(A.addPayment(d, pay(resId, { amount: 500 }), TODAY)).data;
  d = ok(A.addExpense(d, { category: 'supplies', amount: 10, currency: 'USD', rateToBase: 50, date: TODAY, description: 'مستلزمات' }, TODAY)).data; // 500 EGP
  d = ok(A.checkInReservation(d, resId, TODAY)).data;
  const dash = computeDashboard(d, TODAY);
  assert.equal(dash.byStatus.occupied, 1);
  assert.equal(dash.occupancyRate, 100);
  assert.equal(dash.revenueBase, 1500);
  assert.equal(dash.expensesBase, 500);
  assert.equal(dash.netBase, 1000);
  assert.equal(dash.outstandingBase, 1500);
  assert.deepEqual(dash.revenueByCurrency.map((x) => [x.currency, x.amount]).sort(), [['EGP', 500], ['USD', 20]]);
  assert.equal(dash.departuresToday.length, 0);
  void roomId; void guestId;
});

test('reports use real data and respect the date range', () => {
  let { d, resId } = withReservation(); // stay 16..19 (nights 16,17,18)
  d = ok(A.addPayment(d, pay(resId, { amount: 500 }), TODAY)).data;
  d = ok(A.addExpense(d, { category: 'cleaning', amount: 100, currency: 'EGP', rateToBase: 1, date: '2026-10-01', description: 'x' }, TODAY)).data;
  const occ = occupancyReport(d, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(occ.days, 31);
  assert.equal(occ.rows[0].occupiedNights, 3);
  assert.equal(occ.totalOccupied, 3);
  const occPartial = occupancyReport(d, { from: '2026-10-18', to: '2026-10-20' });
  assert.equal(occPartial.rows[0].occupiedNights, 1);
  assert.equal(revenueReport(d, { from: '2026-10-01', to: '2026-10-31' }).totalBase, 500);
  assert.equal(revenueReport(d, { from: '2026-11-01', to: '2026-11-30' }).totalBase, 0);
  assert.equal(expensesReport(d, { from: '2026-10-01', to: '2026-10-10' }).totalBase, 100);
  assert.equal(expensesReport(d, { from: '2026-10-11', to: '2026-10-31' }).totalBase, 0);
  assert.equal(reservationsReport(d, { from: '2026-10-01', to: '2026-10-31' }).rows.length, 1);
  assert.equal(reservationsReport(d, { from: '2026-10-20', to: '2026-10-31' }).rows.length, 0);
});
