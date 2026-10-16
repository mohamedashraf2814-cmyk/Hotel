import { SCHEMA_VERSION, defaultSettings } from './defaults';
import { isValidDateStr } from './dates';
import { isKnownCurrency } from './currencies';
import { EXPENSE_CATEGORIES, ID_TYPES, PAYMENT_METHODS, ROOM_TYPES } from './actions';
import type {
  AppData,
  Expense,
  Guest,
  Payment,
  Reservation,
  Room,
  Settings,
} from './types';

export const BACKUP_APP_ID = 'hotel-management-frontend';

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: AppData;
}

export function buildBackup(data: AppData): string {
  const file: BackupFile = { app: BACKUP_APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
  return JSON.stringify(file, null, 2);
}

class ValidationError extends Error {}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function bad(where: string, msg: string): never {
  throw new ValidationError(`${where}: ${msg}`);
}
function str(o: Obj, k: string, where: string, opts: { optional?: boolean; max?: number } = {}): string {
  const v = o[k];
  if (v === undefined || v === null) {
    if (opts.optional) return '';
    bad(where, `الحقل «${k}» مفقود`);
  }
  if (typeof v !== 'string') bad(where, `الحقل «${k}» يجب أن يكون نصًا`);
  if (v.length > (opts.max ?? 2000)) bad(where, `الحقل «${k}» طويل جدًا`);
  return v;
}
function num(o: Obj, k: string, where: string, opts: { min?: number; int?: boolean; positive?: boolean } = {}): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(where, `الحقل «${k}» يجب أن يكون رقمًا`);
  if (opts.int && !Number.isInteger(v)) bad(where, `الحقل «${k}» يجب أن يكون عددًا صحيحًا`);
  if (opts.positive && v <= 0) bad(where, `الحقل «${k}» يجب أن يكون أكبر من صفر`);
  if (opts.min !== undefined && v < opts.min) bad(where, `الحقل «${k}» أقل من الحد المسموح`);
  return v;
}
function date(o: Obj, k: string, where: string): string {
  const v = str(o, k, where);
  if (!isValidDateStr(v)) bad(where, `الحقل «${k}» ليس تاريخًا صحيحًا`);
  return v;
}
function oneOf<T extends string>(o: Obj, k: string, allowed: readonly T[], where: string): T {
  const v = o[k];
  if (typeof v !== 'string' || !allowed.includes(v as T)) bad(where, `قيمة غير صحيحة في الحقل «${k}»`);
  return v as T;
}
function arr(o: Obj, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) bad('الملف', `القسم «${k}» مفقود أو غير صحيح`);
  return v;
}
function iso(o: Obj, k: string, where: string): string {
  const v = str(o, k, where, { optional: true });
  return v || new Date(0).toISOString();
}
function cur(o: Obj, k: string, where: string): string {
  const v = str(o, k, where);
  if (!isKnownCurrency(v)) bad(where, `عملة غير مدعومة «${v}»`);
  return v;
}

function parseSettings(raw: unknown): Settings {
  if (!isObj(raw)) bad('الإعدادات', 'غير صحيحة');
  const w = 'الإعدادات';
  const d = defaultSettings();
  const currencies = arr(raw, 'currencies').map((c, i) => {
    if (!isObj(c)) bad(w, `عملة رقم ${i + 1} غير صحيحة`);
    return { code: cur(c, 'code', w), rate: num(c, 'rate', w, { positive: true }) };
  });
  const baseCurrency = cur(raw, 'baseCurrency', w);
  const base = currencies.find((c) => c.code === baseCurrency);
  if (!base || base.rate !== 1) bad(w, 'العملة الأساسية يجب أن تكون ضمن العملات وسعرها 1');
  const defaultRoomCurrency = cur(raw, 'defaultRoomCurrency', w);
  if (!currencies.some((c) => c.code === defaultRoomCurrency)) bad(w, 'عملة الغرف الافتراضية غير مفعّلة');
  const pageSize = num(raw, 'pageSize', w, { int: true });
  return {
    hotelName: str(raw, 'hotelName', w, { max: 80 }) || d.hotelName,
    phone: str(raw, 'phone', w, { optional: true, max: 30 }),
    email: str(raw, 'email', w, { optional: true, max: 120 }),
    address: str(raw, 'address', w, { optional: true, max: 200 }),
    website: str(raw, 'website', w, { optional: true, max: 120 }),
    baseCurrency,
    currencies,
    defaultRoomPrice: num(raw, 'defaultRoomPrice', w, { min: 0 }),
    defaultRoomCurrency,
    pageSize: [10, 20, 50].includes(pageSize) ? pageSize : 10,
    digits: oneOf(raw, 'digits', ['latn', 'arab'] as const, w),
    invoiceNote: str(raw, 'invoiceNote', w, { optional: true, max: 300 }),
  };
}

/**
 * Validates and sanitises an unknown value as application data.
 * Never mutates the current data; throws nothing (returns an error string instead).
 */
export function validateAppData(raw: unknown): { ok: true; data: AppData } | { ok: false; error: string } {
  try {
    if (!isObj(raw)) bad('الملف', 'بنية البيانات غير صحيحة');
    const settings = parseSettings(raw.settings);

    const rooms: Room[] = arr(raw, 'rooms').map((r, i) => {
      const w = `الغرفة رقم ${i + 1}`;
      if (!isObj(r)) bad(w, 'غير صحيحة');
      return {
        id: str(r, 'id', w, { max: 80 }),
        number: str(r, 'number', w, { max: 10 }),
        type: oneOf(r, 'type', ROOM_TYPES, w),
        floor: num(r, 'floor', w, { int: true }),
        capacity: num(r, 'capacity', w, { int: true, min: 1 }),
        pricePerNight: num(r, 'pricePerNight', w, { min: 0 }),
        currency: cur(r, 'currency', w),
        status: oneOf(r, 'status', ['available', 'cleaning', 'maintenance'] as const, w),
        description: str(r, 'description', w, { optional: true, max: 500 }),
        createdAt: iso(r, 'createdAt', w),
        updatedAt: iso(r, 'updatedAt', w),
      };
    });

    const guests: Guest[] = arr(raw, 'guests').map((g, i) => {
      const w = `النزيل رقم ${i + 1}`;
      if (!isObj(g)) bad(w, 'غير صحيح');
      return {
        id: str(g, 'id', w, { max: 80 }),
        fullName: str(g, 'fullName', w, { max: 100 }),
        phone: str(g, 'phone', w, { optional: true, max: 30 }),
        email: str(g, 'email', w, { optional: true, max: 120 }),
        nationality: str(g, 'nationality', w, { optional: true, max: 60 }),
        idType: oneOf(g, 'idType', ID_TYPES, w),
        idNumber: str(g, 'idNumber', w, { optional: true, max: 30 }),
        address: str(g, 'address', w, { optional: true, max: 300 }),
        notes: str(g, 'notes', w, { optional: true, max: 500 }),
        createdAt: iso(g, 'createdAt', w),
        updatedAt: iso(g, 'updatedAt', w),
      };
    });

    const reservations: Reservation[] = arr(raw, 'reservations').map((r, i) => {
      const w = `الحجز رقم ${i + 1}`;
      if (!isObj(r)) bad(w, 'غير صحيح');
      const res: Reservation = {
        id: str(r, 'id', w, { max: 80 }),
        number: num(r, 'number', w, { int: true, min: 1 }),
        guestId: str(r, 'guestId', w, { max: 80 }),
        roomId: str(r, 'roomId', w, { max: 80 }),
        checkIn: date(r, 'checkIn', w),
        checkOut: date(r, 'checkOut', w),
        guestsCount: num(r, 'guestsCount', w, { int: true, min: 1 }),
        currency: cur(r, 'currency', w),
        pricePerNight: num(r, 'pricePerNight', w, { min: 0 }),
        discount: num(r, 'discount', w, { min: 0 }),
        status: oneOf(r, 'status', ['confirmed', 'checked_in', 'checked_out', 'cancelled'] as const, w),
        notes: str(r, 'notes', w, { optional: true, max: 500 }),
        createdAt: iso(r, 'createdAt', w),
        updatedAt: iso(r, 'updatedAt', w),
      };
      if (res.checkOut <= res.checkIn) bad(w, 'تاريخ المغادرة يجب أن يكون بعد تاريخ الدخول');
      for (const k of ['checkedInAt', 'checkedOutAt', 'cancelledAt'] as const) {
        const v = r[k];
        if (typeof v === 'string') res[k] = v;
      }
      return res;
    });

    const payments: Payment[] = arr(raw, 'payments').map((p, i) => {
      const w = `الدفعة رقم ${i + 1}`;
      if (!isObj(p)) bad(w, 'غير صحيحة');
      return {
        id: str(p, 'id', w, { max: 80 }),
        reservationId: str(p, 'reservationId', w, { max: 80 }),
        date: date(p, 'date', w),
        amount: num(p, 'amount', w, { positive: true }),
        currency: cur(p, 'currency', w),
        rateToBase: num(p, 'rateToBase', w, { positive: true }),
        appliedAmount: num(p, 'appliedAmount', w, { min: 0 }),
        method: oneOf(p, 'method', PAYMENT_METHODS, w),
        reference: str(p, 'reference', w, { optional: true, max: 60 }),
        notes: str(p, 'notes', w, { optional: true, max: 300 }),
        createdAt: iso(p, 'createdAt', w),
      };
    });

    const expenses: Expense[] = arr(raw, 'expenses').map((x, i) => {
      const w = `المصروف رقم ${i + 1}`;
      if (!isObj(x)) bad(w, 'غير صحيح');
      return {
        id: str(x, 'id', w, { max: 80 }),
        category: oneOf(x, 'category', EXPENSE_CATEGORIES, w),
        amount: num(x, 'amount', w, { positive: true }),
        currency: cur(x, 'currency', w),
        rateToBase: num(x, 'rateToBase', w, { positive: true }),
        date: date(x, 'date', w),
        description: str(x, 'description', w, { optional: true, max: 300 }),
        createdAt: iso(x, 'createdAt', w),
        updatedAt: iso(x, 'updatedAt', w),
      };
    });

    // uniqueness & referential integrity
    const ensureUnique = (items: { id: string }[], label: string) => {
      const s = new Set<string>();
      for (const it of items) {
        if (s.has(it.id)) bad(label, 'يوجد معرّف مكرر');
        s.add(it.id);
      }
    };
    ensureUnique(rooms, 'الغرف');
    ensureUnique(guests, 'النزلاء');
    ensureUnique(reservations, 'الحجوزات');
    ensureUnique(payments, 'الدفعات');
    ensureUnique(expenses, 'المصروفات');
    const roomNums = new Set<string>();
    for (const r of rooms) {
      const k = r.number.trim().toLowerCase();
      if (roomNums.has(k)) bad('الغرف', `رقم الغرفة «${r.number}» مكرر`);
      roomNums.add(k);
    }
    const roomIds = new Set(rooms.map((r) => r.id));
    const guestIds = new Set(guests.map((g) => g.id));
    const resIds = new Set(reservations.map((r) => r.id));
    for (const r of reservations) {
      if (!roomIds.has(r.roomId)) bad(`الحجز #${r.number}`, 'يشير إلى غرفة غير موجودة');
      if (!guestIds.has(r.guestId)) bad(`الحجز #${r.number}`, 'يشير إلى نزيل غير موجود');
    }
    for (const p of payments) {
      if (!resIds.has(p.reservationId)) bad('الدفعات', 'توجد دفعة مرتبطة بحجز غير موجود');
    }
    const enabled = new Set(settings.currencies.map((c) => c.code));
    for (const code of [...rooms.map((r) => r.currency), ...reservations.map((r) => r.currency), ...payments.map((p) => p.currency), ...expenses.map((x) => x.currency)]) {
      if (!enabled.has(code)) bad('العملات', `العملة ${code} مستخدمة في السجلات لكنها غير مفعّلة في الإعدادات`);
    }
    // overlapping active reservations are not allowed
    const active = reservations.filter((r) => r.status === 'confirmed' || r.status === 'checked_in');
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        if (a.roomId === b.roomId && a.checkIn < b.checkOut && b.checkIn < a.checkOut)
          bad('الحجوزات', `تعارض بين الحجز #${a.number} والحجز #${b.number} على نفس الغرفة`);
      }
    }

    const maxNo = reservations.reduce((m, r) => Math.max(m, r.number), 0);
    let counter = maxNo;
    if (isObj(raw.counters) && typeof raw.counters.reservation === 'number' && Number.isInteger(raw.counters.reservation)) {
      counter = Math.max(maxNo, raw.counters.reservation);
    }

    return { ok: true, data: { settings, rooms, guests, reservations, payments, expenses, counters: { reservation: counter } } };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    return { ok: false, error: 'تعذّر قراءة البيانات.' };
  }
}

export function parseBackup(text: string): { ok: true; data: AppData; exportedAt?: string } | { ok: false; error: string } {
  if (text.length > 20 * 1024 * 1024) return { ok: false, error: 'الملف كبير جدًا.' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'الملف ليس بصيغة JSON صحيحة.' };
  }
  if (!isObj(json) || json.app !== BACKUP_APP_ID) return { ok: false, error: 'هذا الملف ليس نسخة احتياطية من هذا التطبيق.' };
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion > SCHEMA_VERSION)
    return { ok: false, error: 'إصدار النسخة الاحتياطية أحدث من إصدار التطبيق الحالي.' };
  const v = validateAppData(json.data);
  if (!v.ok) return { ok: false, error: `النسخة الاحتياطية غير صالحة — ${v.error}` };
  return { ok: true, data: v.data, exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : undefined };
}
