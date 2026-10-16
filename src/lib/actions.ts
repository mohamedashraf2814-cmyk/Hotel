import { isKnownCurrency, roundCur, roundRate, currencyInfo } from './currencies';
import { isValidDateStr, nightsBetween, todayStr } from './dates';
import { newId, nowIso } from './ids';
import {
  canCancel,
  canCheckIn,
  canCheckOut,
  convertAmount,
  findConflict,
  getRate,
  reservationFinance,
  reservationTotals,
  roomById,
} from './logic';
import { MANUAL_ROOM_STATUSES } from './labels';
import type {
  ActionResult,
  AppData,
  CurrencyCode,
  ExpenseCategory,
  FieldErrors,
  IdType,
  ManualRoomStatus,
  PaymentMethod,
  RoomType,
  Settings,
} from './types';

// ---------- helpers ----------

function fail(errors: FieldErrors): ActionResult {
  return { ok: false, errors };
}
function failMsg(error: string): ActionResult {
  return { ok: false, error };
}
function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}
function isInt(n: unknown): n is number {
  return isNum(n) && Number.isInteger(n);
}
function currencyEnabled(data: AppData, code: CurrencyCode): boolean {
  return code === data.settings.baseCurrency || data.settings.currencies.some((c) => c.code === code);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-()]{6,20}$/;

export const ROOM_TYPES: RoomType[] = ['single', 'double', 'twin', 'triple', 'family', 'deluxe', 'suite'];
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer'];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'salaries',
  'utilities',
  'maintenance',
  'supplies',
  'cleaning',
  'marketing',
  'taxes',
  'other',
];
export const ID_TYPES: IdType[] = ['', 'national_id', 'passport', 'driving_license', 'other'];

// ---------- rooms ----------

export interface RoomInput {
  number: string;
  type: RoomType;
  floor: number;
  capacity: number;
  pricePerNight: number;
  currency: CurrencyCode;
  status: ManualRoomStatus;
  description: string;
}

export function validateRoom(data: AppData, input: RoomInput, excludeId?: string): FieldErrors {
  const e: FieldErrors = {};
  const number = input.number.trim();
  if (!number) e.number = 'رقم الغرفة مطلوب.';
  else if (number.length > 10) e.number = 'رقم الغرفة طويل جدًا (10 خانات كحد أقصى).';
  else if (data.rooms.some((r) => r.id !== excludeId && r.number.trim().toLowerCase() === number.toLowerCase()))
    e.number = 'رقم الغرفة مستخدم بالفعل. اختر رقمًا آخر.';
  if (!ROOM_TYPES.includes(input.type)) e.type = 'اختر نوع الغرفة.';
  if (!isInt(input.floor) || input.floor < -5 || input.floor > 200) e.floor = 'أدخل رقم طابق صحيحًا.';
  if (!isInt(input.capacity) || input.capacity < 1 || input.capacity > 20) e.capacity = 'السعة يجب أن تكون عددًا صحيحًا بين 1 و 20.';
  if (!isNum(input.pricePerNight) || input.pricePerNight <= 0) e.pricePerNight = 'سعر الليلة يجب أن يكون أكبر من صفر.';
  if (!currencyEnabled(data, input.currency)) e.currency = 'العملة غير مفعّلة في الإعدادات.';
  if (!MANUAL_ROOM_STATUSES.includes(input.status)) e.status = 'حالة الغرفة غير صحيحة.';
  if (input.description.length > 500) e.description = 'الوصف طويل جدًا (500 حرف كحد أقصى).';
  if (!e.status && input.status !== 'available' && excludeId) {
    if (data.reservations.some((r) => r.roomId === excludeId && r.status === 'checked_in'))
      e.status = 'يوجد نزيل داخل الغرفة حاليًا. سجّل مغادرته قبل تغيير الحالة.';
  }
  return e;
}

export function addRoom(data: AppData, input: RoomInput): ActionResult {
  const errors = validateRoom(data, input);
  if (Object.keys(errors).length) return fail(errors);
  const id = newId();
  const t = nowIso();
  return {
    ok: true,
    id,
    data: {
      ...data,
      rooms: [
        ...data.rooms,
        { id, ...input, number: input.number.trim(), description: input.description.trim(), createdAt: t, updatedAt: t },
      ],
    },
  };
}

export function updateRoom(data: AppData, id: string, input: RoomInput): ActionResult {
  const room = data.rooms.find((r) => r.id === id);
  if (!room) return failMsg('الغرفة غير موجودة.');
  const errors = validateRoom(data, input, id);
  if (Object.keys(errors).length) return fail(errors);
  return {
    ok: true,
    id,
    data: {
      ...data,
      rooms: data.rooms.map((r) =>
        r.id === id
          ? { ...r, ...input, number: input.number.trim(), description: input.description.trim(), updatedAt: nowIso() }
          : r,
      ),
    },
  };
}

export function setRoomStatus(data: AppData, id: string, status: ManualRoomStatus): ActionResult {
  const room = data.rooms.find((r) => r.id === id);
  if (!room) return failMsg('الغرفة غير موجودة.');
  if (status !== 'available' && data.reservations.some((r) => r.roomId === id && r.status === 'checked_in'))
    return failMsg('يوجد نزيل داخل الغرفة حاليًا. سجّل مغادرته أولًا.');
  return {
    ok: true,
    id,
    data: { ...data, rooms: data.rooms.map((r) => (r.id === id ? { ...r, status, updatedAt: nowIso() } : r)) },
  };
}

export function deleteRoom(data: AppData, id: string): ActionResult {
  const room = data.rooms.find((r) => r.id === id);
  if (!room) return failMsg('الغرفة غير موجودة.');
  const used = data.reservations.filter((r) => r.roomId === id).length;
  if (used > 0)
    return failMsg(
      `لا يمكن حذف الغرفة لأنها مرتبطة بـ ${used} حجز/حجوزات. للحفاظ على السجلات يمكنك تغيير حالتها إلى «تحت الصيانة» بدلًا من الحذف.`,
    );
  return { ok: true, id, data: { ...data, rooms: data.rooms.filter((r) => r.id !== id) } };
}

// ---------- guests ----------

export interface GuestInput {
  fullName: string;
  phone: string;
  email: string;
  nationality: string;
  idType: IdType;
  idNumber: string;
  address: string;
  notes: string;
}

export function validateGuest(input: GuestInput): FieldErrors {
  const e: FieldErrors = {};
  const name = input.fullName.trim();
  if (!name) e.fullName = 'الاسم الكامل مطلوب.';
  else if (name.length < 3) e.fullName = 'الاسم قصير جدًا.';
  else if (name.length > 100) e.fullName = 'الاسم طويل جدًا.';
  const phone = input.phone.trim();
  if (!phone) e.phone = 'رقم الهاتف مطلوب.';
  else if (!PHONE_RE.test(phone)) e.phone = 'رقم الهاتف غير صحيح.';
  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) e.email = 'البريد الإلكتروني غير صحيح.';
  if (!ID_TYPES.includes(input.idType)) e.idType = 'نوع الهوية غير صحيح.';
  if (input.idType && !input.idNumber.trim()) e.idNumber = 'أدخل رقم الهوية أو اترك نوع الهوية غير محدد.';
  if (!input.idType && input.idNumber.trim()) e.idType = 'اختر نوع الهوية.';
  if (input.idNumber.length > 30) e.idNumber = 'رقم الهوية طويل جدًا.';
  if (input.notes.length > 500) e.notes = 'الملاحظات طويلة جدًا (500 حرف كحد أقصى).';
  return e;
}

function cleanGuest(input: GuestInput): GuestInput {
  return {
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    nationality: input.nationality.trim(),
    idType: input.idType,
    idNumber: input.idNumber.trim(),
    address: input.address.trim(),
    notes: input.notes.trim(),
  };
}

export function addGuest(data: AppData, input: GuestInput): ActionResult {
  const errors = validateGuest(input);
  if (Object.keys(errors).length) return fail(errors);
  const id = newId();
  const t = nowIso();
  return { ok: true, id, data: { ...data, guests: [...data.guests, { id, ...cleanGuest(input), createdAt: t, updatedAt: t }] } };
}

export function updateGuest(data: AppData, id: string, input: GuestInput): ActionResult {
  if (!data.guests.some((g) => g.id === id)) return failMsg('النزيل غير موجود.');
  const errors = validateGuest(input);
  if (Object.keys(errors).length) return fail(errors);
  return {
    ok: true,
    id,
    data: { ...data, guests: data.guests.map((g) => (g.id === id ? { ...g, ...cleanGuest(input), updatedAt: nowIso() } : g)) },
  };
}

export function deleteGuest(data: AppData, id: string): ActionResult {
  if (!data.guests.some((g) => g.id === id)) return failMsg('النزيل غير موجود.');
  const used = data.reservations.filter((r) => r.guestId === id).length;
  if (used > 0) return failMsg(`لا يمكن حذف النزيل لأن لديه ${used} حجز/حجوزات مسجلة. السجلات المرتبطة بحجوزات تبقى محفوظة.`);
  return { ok: true, id, data: { ...data, guests: data.guests.filter((g) => g.id !== id) } };
}

// ---------- reservations ----------

export interface ReservationInput {
  guestId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  currency: CurrencyCode;
  pricePerNight: number;
  discount: number;
  notes: string;
}

export function validateReservation(
  data: AppData,
  input: ReservationInput,
  opts: { excludeId?: string; today?: string } = {},
): FieldErrors {
  const e: FieldErrors = {};
  const today = opts.today ?? todayStr();
  const existing = opts.excludeId ? data.reservations.find((r) => r.id === opts.excludeId) : undefined;

  if (!input.guestId || !data.guests.some((g) => g.id === input.guestId)) e.guestId = 'اختر النزيل.';
  const room = roomById(data, input.roomId);
  if (!input.roomId || !room) e.roomId = 'اختر الغرفة.';

  const inOk = isValidDateStr(input.checkIn);
  const outOk = isValidDateStr(input.checkOut);
  if (!inOk) e.checkIn = 'أدخل تاريخ دخول صحيحًا.';
  if (!outOk) e.checkOut = 'أدخل تاريخ مغادرة صحيحًا.';
  if (inOk && outOk) {
    const nights = nightsBetween(input.checkIn, input.checkOut);
    if (nights < 1) e.checkOut = 'تاريخ المغادرة يجب أن يكون بعد تاريخ الدخول بليلة واحدة على الأقل.';
    else if (nights > 365) e.checkOut = 'مدة الإقامة لا يجب أن تتجاوز 365 ليلة.';
  }
  if (inOk && (!existing || existing.checkIn !== input.checkIn) && input.checkIn < today)
    e.checkIn = 'لا يمكن إنشاء حجز بتاريخ دخول في الماضي.';
  if (existing && existing.status === 'checked_in' && outOk && input.checkOut <= today)
    e.checkOut = 'تاريخ المغادرة لنزيل داخل الفندق يجب أن يكون بعد اليوم. لإنهاء الإقامة استخدم تسجيل المغادرة.';

  if (!isInt(input.guestsCount) || input.guestsCount < 1) e.guestsCount = 'عدد النزلاء يجب أن يكون 1 على الأقل.';
  else if (room && input.guestsCount > room.capacity) e.guestsCount = `عدد النزلاء يتجاوز سعة الغرفة (${room.capacity}).`;

  if (!currencyEnabled(data, input.currency)) e.currency = 'العملة غير مفعّلة في الإعدادات.';
  else if (existing && existing.currency !== input.currency && data.payments.some((p) => p.reservationId === existing.id))
    e.currency = 'لا يمكن تغيير عملة حجز عليه دفعات مسجلة.';

  if (!isNum(input.pricePerNight) || input.pricePerNight <= 0) e.pricePerNight = 'سعر الليلة يجب أن يكون أكبر من صفر.';
  if (!isNum(input.discount) || input.discount < 0) e.discount = 'الخصم لا يمكن أن يكون سالبًا.';
  else if (!e.pricePerNight && !e.checkOut && !e.checkIn) {
    const t = reservationTotals({ ...input, discount: 0 });
    if (input.discount > t.subtotal) e.discount = 'الخصم أكبر من إجمالي الإقامة.';
  }
  if (input.notes.length > 500) e.notes = 'الملاحظات طويلة جدًا (500 حرف كحد أقصى).';

  if (!e.roomId && !e.checkIn && !e.checkOut) {
    const c = findConflict(data.reservations, {
      roomId: input.roomId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      excludeId: opts.excludeId,
    });
    if (c) e.roomId = `الغرفة محجوزة في هذه الفترة (حجز #${String(c.number).padStart(4, '0')} من ${c.checkIn} إلى ${c.checkOut}).`;
  }

  // financial consistency: new total must not be lower than what was already paid
  if (existing && !Object.keys(e).length) {
    const paid = reservationFinance(existing, data.payments).paid;
    const newTotal = reservationTotals(input).total;
    if (paid > newTotal + 1e-9) e.discount = `المدفوع حتى الآن (${paid}) أكبر من الإجمالي الجديد (${newTotal}). عدّل الدفعات أولًا.`;
  }
  return e;
}

export function addReservation(data: AppData, input: ReservationInput, today = todayStr()): ActionResult {
  const errors = validateReservation(data, input, { today });
  if (Object.keys(errors).length) return fail(errors);
  const id = newId();
  const t = nowIso();
  const number = data.counters.reservation + 1;
  return {
    ok: true,
    id,
    data: {
      ...data,
      counters: { ...data.counters, reservation: number },
      reservations: [
        ...data.reservations,
        {
          id,
          number,
          ...input,
          pricePerNight: roundCur(input.pricePerNight, input.currency),
          discount: roundCur(input.discount, input.currency),
          notes: input.notes.trim(),
          status: 'confirmed',
          createdAt: t,
          updatedAt: t,
        },
      ],
    },
  };
}

export function updateReservation(data: AppData, id: string, input: ReservationInput, today = todayStr()): ActionResult {
  const res = data.reservations.find((r) => r.id === id);
  if (!res) return failMsg('الحجز غير موجود.');
  if (res.status !== 'confirmed' && res.status !== 'checked_in')
    return failMsg('لا يمكن تعديل حجز ملغي أو منتهٍ.');
  let next = input;
  if (res.status === 'checked_in') {
    // identity of a running stay is locked
    next = { ...input, guestId: res.guestId, roomId: res.roomId, checkIn: res.checkIn };
  }
  const errors = validateReservation(data, next, { excludeId: id, today });
  if (Object.keys(errors).length) return fail(errors);
  return {
    ok: true,
    id,
    data: {
      ...data,
      reservations: data.reservations.map((r) =>
        r.id === id
          ? {
              ...r,
              ...next,
              pricePerNight: roundCur(next.pricePerNight, next.currency),
              discount: roundCur(next.discount, next.currency),
              notes: next.notes.trim(),
              updatedAt: nowIso(),
            }
          : r,
      ),
    },
  };
}

export function checkInReservation(data: AppData, id: string, today = todayStr()): ActionResult {
  const res = data.reservations.find((r) => r.id === id);
  if (!res) return failMsg('الحجز غير موجود.');
  const c = canCheckIn(data, res, today);
  if (!c.ok) return failMsg(c.error);
  const t = nowIso();
  return {
    ok: true,
    id,
    data: {
      ...data,
      reservations: data.reservations.map((r) => (r.id === id ? { ...r, status: 'checked_in', checkedInAt: t, updatedAt: t } : r)),
    },
  };
}

/** Checks out the guest. The room automatically moves to "cleaning". */
export function checkOutReservation(data: AppData, id: string): ActionResult {
  const res = data.reservations.find((r) => r.id === id);
  if (!res) return failMsg('الحجز غير موجود.');
  const c = canCheckOut(res);
  if (!c.ok) return failMsg(c.error);
  const t = nowIso();
  return {
    ok: true,
    id,
    data: {
      ...data,
      reservations: data.reservations.map((r) => (r.id === id ? { ...r, status: 'checked_out', checkedOutAt: t, updatedAt: t } : r)),
      rooms: data.rooms.map((r) => (r.id === res.roomId ? { ...r, status: 'cleaning', updatedAt: t } : r)),
    },
  };
}

export function cancelReservation(data: AppData, id: string): ActionResult {
  const res = data.reservations.find((r) => r.id === id);
  if (!res) return failMsg('الحجز غير موجود.');
  const c = canCancel(res);
  if (!c.ok) return failMsg(c.error);
  const t = nowIso();
  return {
    ok: true,
    id,
    data: {
      ...data,
      reservations: data.reservations.map((r) => (r.id === id ? { ...r, status: 'cancelled', cancelledAt: t, updatedAt: t } : r)),
    },
  };
}

export function deleteReservation(data: AppData, id: string): ActionResult {
  const res = data.reservations.find((r) => r.id === id);
  if (!res) return failMsg('الحجز غير موجود.');
  if (res.status === 'checked_in') return failMsg('لا يمكن حذف حجز لنزيل داخل الفندق.');
  if (res.status === 'checked_out') return failMsg('لا يمكن حذف حجز منتهٍ لأنه جزء من السجل التاريخي والمالي.');
  if (data.payments.some((p) => p.reservationId === id))
    return failMsg('لا يمكن حذف حجز عليه دفعات مسجلة. احذف الدفعات أولًا إن لزم، أو اكتفِ بإلغاء الحجز.');
  return { ok: true, id, data: { ...data, reservations: data.reservations.filter((r) => r.id !== id) } };
}

// ---------- payments ----------

export interface PaymentInput {
  reservationId: string;
  date: string;
  amount: number;
  currency: CurrencyCode;
  rateToBase: number;
  method: PaymentMethod;
  reference: string;
  notes: string;
}

/** Computes the amount applied to the reservation (in its own currency). */
export function computeApplied(data: AppData, input: Pick<PaymentInput, 'amount' | 'currency' | 'rateToBase'>, resCurrency: CurrencyCode): number {
  if (input.currency === resCurrency) return roundCur(input.amount, resCurrency);
  const resRate = getRate(data.settings, resCurrency) ?? 0;
  return convertAmount(input.amount, input.rateToBase, resRate, resCurrency);
}

export function validatePayment(
  data: AppData,
  input: PaymentInput,
  opts: { excludeId?: string; today?: string } = {},
): FieldErrors {
  const e: FieldErrors = {};
  const today = opts.today ?? todayStr();
  const res = data.reservations.find((r) => r.id === input.reservationId);
  if (!res) e.reservationId = 'اختر الحجز.';
  else if (res.status === 'cancelled') e.reservationId = 'لا يمكن تسجيل دفعة على حجز ملغي.';
  if (!isValidDateStr(input.date)) e.date = 'أدخل تاريخ دفع صحيحًا.';
  else if (input.date > today) e.date = 'تاريخ الدفع لا يمكن أن يكون في المستقبل.';
  if (!currencyEnabled(data, input.currency)) e.currency = 'العملة غير مفعّلة في الإعدادات.';
  if (!isNum(input.amount) || input.amount <= 0) e.amount = 'المبلغ يجب أن يكون أكبر من صفر.';
  if (!isNum(input.rateToBase) || input.rateToBase <= 0) e.rateToBase = 'سعر الصرف يجب أن يكون أكبر من صفر.';
  else if (input.currency === data.settings.baseCurrency && input.rateToBase !== 1) e.rateToBase = 'سعر صرف العملة الأساسية يساوي 1.';
  if (!PAYMENT_METHODS.includes(input.method)) e.method = 'اختر طريقة الدفع.';
  if (input.reference.length > 60) e.reference = 'المرجع طويل جدًا.';
  if (input.notes.length > 300) e.notes = 'الملاحظات طويلة جدًا.';

  if (res && !e.amount && !e.currency && !e.rateToBase) {
    const applied = computeApplied(data, input, res.currency);
    if (applied <= 0) e.amount = 'المبلغ بعد التحويل صغير جدًا.';
    else {
      const others = data.payments.filter((p) => p.reservationId === res.id && p.id !== opts.excludeId);
      const paid = others.reduce((s, p) => s + p.appliedAmount, 0);
      const remaining = roundCur(reservationTotals(res).total - paid, res.currency);
      const tol = 10 ** -currencyInfo(res.currency).decimals / 2;
      if (applied > remaining + tol) {
        e.amount = `المبلغ أكبر من المتبقي على الحجز (${remaining} ${currencyInfo(res.currency).symbol}).`;
      }
    }
  }
  return e;
}

function buildPayment(data: AppData, input: PaymentInput): { currency: CurrencyCode; appliedAmount: number } {
  const res = data.reservations.find((r) => r.id === input.reservationId)!;
  return { currency: input.currency, appliedAmount: computeApplied(data, input, res.currency) };
}

export function addPayment(data: AppData, input: PaymentInput, today = todayStr()): ActionResult {
  const errors = validatePayment(data, input, { today });
  if (Object.keys(errors).length) return fail(errors);
  const id = newId();
  const { appliedAmount } = buildPayment(data, input);
  return {
    ok: true,
    id,
    data: {
      ...data,
      payments: [
        ...data.payments,
        {
          id,
          reservationId: input.reservationId,
          date: input.date,
          amount: roundCur(input.amount, input.currency),
          currency: input.currency,
          rateToBase: roundRate(input.rateToBase),
          appliedAmount,
          method: input.method,
          reference: input.reference.trim(),
          notes: input.notes.trim(),
          createdAt: nowIso(),
        },
      ],
    },
  };
}

export function updatePayment(data: AppData, id: string, input: PaymentInput, today = todayStr()): ActionResult {
  if (!data.payments.some((p) => p.id === id)) return failMsg('الدفعة غير موجودة.');
  const errors = validatePayment(data, input, { excludeId: id, today });
  if (Object.keys(errors).length) return fail(errors);
  const { appliedAmount } = buildPayment(data, input);
  return {
    ok: true,
    id,
    data: {
      ...data,
      payments: data.payments.map((p) =>
        p.id === id
          ? {
              ...p,
              reservationId: input.reservationId,
              date: input.date,
              amount: roundCur(input.amount, input.currency),
              currency: input.currency,
              rateToBase: roundRate(input.rateToBase),
              appliedAmount,
              method: input.method,
              reference: input.reference.trim(),
              notes: input.notes.trim(),
            }
          : p,
      ),
    },
  };
}

export function deletePayment(data: AppData, id: string): ActionResult {
  if (!data.payments.some((p) => p.id === id)) return failMsg('الدفعة غير موجودة.');
  return { ok: true, id, data: { ...data, payments: data.payments.filter((p) => p.id !== id) } };
}

// ---------- expenses ----------

export interface ExpenseInput {
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  rateToBase: number;
  date: string;
  description: string;
}

export function validateExpense(data: AppData, input: ExpenseInput, today = todayStr()): FieldErrors {
  const e: FieldErrors = {};
  if (!EXPENSE_CATEGORIES.includes(input.category)) e.category = 'اختر تصنيف المصروف.';
  if (!isNum(input.amount) || input.amount <= 0) e.amount = 'المبلغ يجب أن يكون أكبر من صفر.';
  if (!currencyEnabled(data, input.currency)) e.currency = 'العملة غير مفعّلة في الإعدادات.';
  if (!isNum(input.rateToBase) || input.rateToBase <= 0) e.rateToBase = 'سعر الصرف يجب أن يكون أكبر من صفر.';
  else if (input.currency === data.settings.baseCurrency && input.rateToBase !== 1) e.rateToBase = 'سعر صرف العملة الأساسية يساوي 1.';
  if (!isValidDateStr(input.date)) e.date = 'أدخل تاريخًا صحيحًا.';
  else if (input.date > today) e.date = 'تاريخ المصروف لا يمكن أن يكون في المستقبل.';
  if (!input.description.trim()) e.description = 'وصف المصروف مطلوب.';
  else if (input.description.length > 300) e.description = 'الوصف طويل جدًا (300 حرف كحد أقصى).';
  return e;
}

export function addExpense(data: AppData, input: ExpenseInput, today = todayStr()): ActionResult {
  const errors = validateExpense(data, input, today);
  if (Object.keys(errors).length) return fail(errors);
  const id = newId();
  const t = nowIso();
  return {
    ok: true,
    id,
    data: {
      ...data,
      expenses: [
        ...data.expenses,
        {
          id,
          ...input,
          amount: roundCur(input.amount, input.currency),
          rateToBase: roundRate(input.rateToBase),
          description: input.description.trim(),
          createdAt: t,
          updatedAt: t,
        },
      ],
    },
  };
}

export function updateExpense(data: AppData, id: string, input: ExpenseInput, today = todayStr()): ActionResult {
  if (!data.expenses.some((x) => x.id === id)) return failMsg('المصروف غير موجود.');
  const errors = validateExpense(data, input, today);
  if (Object.keys(errors).length) return fail(errors);
  return {
    ok: true,
    id,
    data: {
      ...data,
      expenses: data.expenses.map((x) =>
        x.id === id
          ? {
              ...x,
              ...input,
              amount: roundCur(input.amount, input.currency),
              rateToBase: roundRate(input.rateToBase),
              description: input.description.trim(),
              updatedAt: nowIso(),
            }
          : x,
      ),
    },
  };
}

export function deleteExpense(data: AppData, id: string): ActionResult {
  if (!data.expenses.some((x) => x.id === id)) return failMsg('المصروف غير موجود.');
  return { ok: true, id, data: { ...data, expenses: data.expenses.filter((x) => x.id !== id) } };
}

// ---------- settings ----------

export function validateSettings(data: AppData, s: Settings): FieldErrors {
  const e: FieldErrors = {};
  if (!s.hotelName.trim()) e.hotelName = 'اسم الفندق مطلوب.';
  else if (s.hotelName.length > 80) e.hotelName = 'اسم الفندق طويل جدًا.';
  if (s.phone.trim() && !PHONE_RE.test(s.phone.trim())) e.phone = 'رقم الهاتف غير صحيح.';
  if (s.email.trim() && !EMAIL_RE.test(s.email.trim())) e.email = 'البريد الإلكتروني غير صحيح.';
  if (s.address.length > 200) e.address = 'العنوان طويل جدًا.';
  if (s.website.length > 120) e.website = 'عنوان الموقع طويل جدًا.';
  if (s.invoiceNote.length > 300) e.invoiceNote = 'ملاحظة الفاتورة طويلة جدًا.';
  if (!isNum(s.defaultRoomPrice) || s.defaultRoomPrice < 0) e.defaultRoomPrice = 'السعر الافتراضي غير صحيح.';
  if (![10, 20, 50].includes(s.pageSize)) e.pageSize = 'اختر عدد صفوف صحيحًا.';
  if (s.digits !== 'latn' && s.digits !== 'arab') e.digits = 'اختيار الأرقام غير صحيح.';

  const codes = new Set<string>();
  for (const c of s.currencies) {
    if (!isKnownCurrency(c.code)) e.currencies = `العملة ${c.code} غير مدعومة.`;
    else if (codes.has(c.code)) e.currencies = `العملة ${c.code} مكررة.`;
    else if (!isNum(c.rate) || c.rate <= 0) e.currencies = `سعر صرف ${c.code} يجب أن يكون أكبر من صفر.`;
    codes.add(c.code);
  }
  if (!isKnownCurrency(s.baseCurrency)) e.baseCurrency = 'اختر عملة أساسية.';
  else if (!codes.has(s.baseCurrency)) e.baseCurrency = 'العملة الأساسية يجب أن تكون ضمن العملات المفعّلة.';
  else if (s.currencies.find((c) => c.code === s.baseCurrency)?.rate !== 1) e.baseCurrency = 'سعر صرف العملة الأساسية يجب أن يكون 1.';
  if (!codes.has(s.defaultRoomCurrency)) e.defaultRoomCurrency = 'عملة الغرف الافتراضية يجب أن تكون ضمن العملات المفعّلة.';

  if (!e.baseCurrency && s.baseCurrency !== data.settings.baseCurrency && (data.payments.length > 0 || data.expenses.length > 0))
    e.baseCurrency = 'لا يمكن تغيير العملة الأساسية بعد تسجيل دفعات أو مصروفات، حفاظًا على دقة السجلات المالية.';

  if (!e.currencies) {
    const inUse = new Set<string>([
      ...data.rooms.map((r) => r.currency),
      ...data.reservations.map((r) => r.currency),
      ...data.payments.map((p) => p.currency),
      ...data.expenses.map((x) => x.currency),
    ]);
    for (const old of data.settings.currencies) {
      if (!codes.has(old.code) && inUse.has(old.code)) {
        e.currencies = `لا يمكن إزالة العملة ${old.code} لأنها مستخدمة في سجلات حالية.`;
        break;
      }
    }
  }
  return e;
}

export function updateSettings(data: AppData, s: Settings): ActionResult {
  const errors = validateSettings(data, s);
  if (Object.keys(errors).length) return fail(errors);
  return {
    ok: true,
    data: {
      ...data,
      settings: {
        ...s,
        hotelName: s.hotelName.trim(),
        phone: s.phone.trim(),
        email: s.email.trim(),
        address: s.address.trim(),
        website: s.website.trim(),
        invoiceNote: s.invoiceNote.trim(),
        currencies: s.currencies.map((c) => ({ code: c.code, rate: c.code === s.baseCurrency ? 1 : roundRate(c.rate) })),
      },
    },
  };
}
