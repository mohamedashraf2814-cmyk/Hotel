import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/lib/actions';
import { buildBackup, parseBackup, validateAppData } from '../src/lib/backup';
import { toCsv } from '../src/lib/csv';
import { emptyData } from '../src/lib/defaults';
import { ok, errs, seeded, resInput, TODAY } from './helpers';

// ---- fake browser storage (must be installed before the storage module is used) ----
class FakeStorage {
  private m = new Map<string, string>();
  quota = Infinity;
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) {
    let size = v.length;
    for (const [kk, vv] of this.m) if (kk !== k) size += vv.length;
    if (size > this.quota) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
    this.m.set(k, v);
  }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const fake = new FakeStorage();
(globalThis as unknown as { window: unknown }).window = { localStorage: fake };

test('settings: base currency / currencies rules', () => {
  const { d, roomId, guestId } = seeded();
  const s = d.settings;
  assert.ok(errs(A.updateSettings(d, { ...s, currencies: [{ code: 'EGP', rate: 1 }, { code: 'USD', rate: 0 }] })).currencies);
  assert.ok(errs(A.updateSettings(d, { ...s, hotelName: '' })).hotelName);
  assert.ok(errs(A.updateSettings(d, { ...s, baseCurrency: 'USD' })).baseCurrency); // USD rate is 50, not 1
  // cannot drop a currency in use
  const r = ok(A.addReservation(d, resInput(guestId, roomId, { currency: 'USD', pricePerNight: 10 }), TODAY));
  assert.ok(errs(A.updateSettings(r.data, { ...s, currencies: [{ code: 'EGP', rate: 1 }] })).currencies);
  // changing the base currency after financial records is blocked
  const p = ok(A.addPayment(r.data, { reservationId: r.id!, date: TODAY, amount: 10, currency: 'USD', rateToBase: 50, method: 'card', reference: '', notes: '' }, TODAY));
  const swapped = { ...s, baseCurrency: 'USD', currencies: [{ code: 'USD', rate: 1 }, { code: 'EGP', rate: 0.02 }], defaultRoomCurrency: 'USD' };
  assert.ok(errs(A.updateSettings(p.data, swapped)).baseCurrency);
  // but possible on an empty system
  const fresh = emptyData();
  const sw = ok(A.updateSettings(fresh, { ...fresh.settings, baseCurrency: 'SAR', currencies: [{ code: 'SAR', rate: 1 }], defaultRoomCurrency: 'SAR' }));
  assert.equal(sw.data.settings.baseCurrency, 'SAR');
});

test('backup round-trip preserves everything', () => {
  const { d, roomId, guestId } = seeded();
  let x = ok(A.addReservation(d, resInput(guestId, roomId), TODAY)).data;
  x = ok(A.addPayment(x, { reservationId: x.reservations[0].id, date: TODAY, amount: 20, currency: 'USD', rateToBase: 50, method: 'bank_transfer', reference: 'R1', notes: '' }, TODAY)).data;
  x = ok(A.addExpense(x, { category: 'taxes', amount: 5, currency: 'SAR', rateToBase: 13.33, date: TODAY, description: 'ضريبة' }, TODAY)).data;
  const parsed = parseBackup(buildBackup(x));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.data, x);
});

test('invalid backups are rejected without side effects', () => {
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup('{"app":"other"}').ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'hotel-management-frontend', schemaVersion: 99, data: {} })).ok, false);
  const { d, roomId, guestId } = seeded();
  const x = ok(A.addReservation(d, resInput(guestId, roomId), TODAY)).data;
  const good = JSON.parse(buildBackup(x));
  const broken = structuredClone(good);
  broken.data.reservations[0].roomId = 'ghost';
  assert.equal(parseBackup(JSON.stringify(broken)).ok, false);
  const broken2 = structuredClone(good);
  broken2.data.rooms[0].pricePerNight = 'abc';
  assert.equal(parseBackup(JSON.stringify(broken2)).ok, false);
  const broken3 = structuredClone(good);
  broken3.data.reservations.push({ ...broken3.data.reservations[0], id: 'dup', number: 2 });
  const r3 = parseBackup(JSON.stringify(broken3));
  assert.equal(r3.ok, false); // overlapping active reservation
  assert.equal(validateAppData(null).ok, false);
  assert.equal(validateAppData({ rooms: [] }).ok, false);
});

test('csv escaping and formula-injection guard', () => {
  const csv = toCsv(['اسم', 'مبلغ'], [['أحمد, "ع"', 10], ['=SUM(A1)', -5.5], [null, '2026-10-16']]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"أحمد, ""ع"""'));
  assert.ok(csv.includes("'=SUM(A1)"));
  assert.ok(csv.includes('-5.5'));
});

test('storage: persists across "reloads", saves only what changed, clear works', async () => {
  const S = await import('../src/lib/storage');
  fake.clear();
  const first = S.loadAll();
  assert.equal(first.persistent, true);
  assert.equal(first.data.rooms.length, 0);
  const { d } = seeded();
  assert.deepEqual(S.saveChanges(null, d), { ok: true });
  const again = S.loadAll(); // simulates page refresh
  assert.deepEqual(again.data, d);
  assert.deepEqual(again.warnings, []);
  assert.ok(S.approximateUsageBytes() > 0);
  S.clearAllStored();
  assert.equal(fake.length, 0);
  assert.equal(S.loadAll().data.rooms.length, 0);
});

test('storage: corrupted JSON is preserved and replaced by defaults, never throws', async () => {
  const S = await import('../src/lib/storage');
  fake.clear();
  fake.setItem(S.PREFIX + 'rooms', '{not valid json');
  const r = S.loadAll();
  assert.equal(r.data.rooms.length, 0);
  assert.ok(r.warnings.length >= 1);
  let kept = false;
  for (let i = 0; i < fake.length; i++) if (fake.key(i)!.includes('corrupt:rooms')) kept = true;
  assert.ok(kept);
});

test('storage: quota error is reported and previous data is restored', async () => {
  const S = await import('../src/lib/storage');
  fake.clear();
  const { d, roomId, guestId } = seeded();
  assert.deepEqual(S.saveChanges(null, d), { ok: true });
  const next = ok(A.addReservation(d, resInput(guestId, roomId), TODAY)).data;
  fake.quota = 10;
  const res = S.saveChanges(d, next);
  assert.equal(res.ok, false);
  fake.quota = Infinity;
  assert.deepEqual(S.loadAll().data, d); // nothing half-written
});
