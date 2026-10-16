/**
 * Spa & restaurant: service catalogue and orders / appointments.
 * Pure functions, same contract as actions.ts (return a new AppData or field errors).
 */
import { currencyInfo, roundCur, roundRate } from './currencies';
import { isValidDateStr, todayStr } from './dates';
import { newId, nowIso } from './ids';
import { convertAmount, getRate, orderTotals, reservationFinance, toBase } from './logic';
import type {
  ActionResult,
  AppData,
  CurrencyCode,
  Department,
  FieldErrors,
  OrderBilling,
  OrderLine,
  PaymentMethod,
  ServiceOrder,
} from './types';

export const DEPARTMENTS: Department[] = ['spa', 'restaurant'];
const METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const fail = (errors: FieldErrors): ActionResult => ({ ok: false, errors });
const failMsg = (error: string): ActionResult => ({ ok: false, error });
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isInt = (n: unknown): n is number => isNum(n) && Number.isInteger(n);
const enabled = (data: AppData, code: CurrencyCode) =>
  code === data.settings.baseCurrency || data.settings.currencies.some((c) => c.code === code);

export function orderLabel(o: Pick<ServiceOrder, 'number' | 'department'>): string {
  return `${o.department === 'spa' ? 'S' : 'R'}-${String(o.number).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface ServiceItemInput {
  department: Department;
  name: string;
  category: string;
  price: number;
  currency: CurrencyCode;
  durationMin: number;
  description: string;
  active: boolean;
}

export function validateServiceItem(data: AppData, input: ServiceItemInput, excludeId?: string): FieldErrors {
  const e: FieldErrors = {};
  const name = input.name.trim();
  if (!DEPARTMENTS.includes(input.department)) e.department = 'القسم غير صحيح.';
  if (!name) e.name = input.department === 'spa' ? 'اسم الخدمة مطلوب.' : 'اسم الصنف مطلوب.';
  else if (name.length > 80) e.name = 'الاسم طويل جدًا (80 حرفًا كحد أقصى).';
  else if (
    data.serviceItems.some(
      (x) => x.id !== excludeId && x.department === input.department && x.name.trim().toLowerCase() === name.toLowerCase(),
    )
  )
    e.name = 'يوجد عنصر بنفس الاسم في هذا القسم.';
  if (!input.category.trim()) e.category = 'التصنيف مطلوب.';
  else if (input.category.length > 40) e.category = 'التصنيف طويل جدًا.';
  if (!isNum(input.price) || input.price <= 0) e.price = 'السعر يجب أن يكون أكبر من صفر.';
  if (!enabled(data, input.currency)) e.currency = 'العملة غير مفعّلة في الإعدادات.';
  if (input.department === 'spa') {
    if (!isInt(input.durationMin) || input.durationMin < 5 || input.durationMin > 600)
      e.durationMin = 'مدة الجلسة بالدقائق يجب أن تكون بين 5 و 600.';
  }
  if (input.description.length > 300) e.description = 'الوصف طويل جدًا (300 حرف كحد أقصى).';
  return e;
}

function cleanItem(input: ServiceItemInput): ServiceItemInput {
  return {
    ...input,
    name: input.name.trim(),
    category: input.category.trim(),
    description: input.description.trim(),
    price: roundCur(input.price, input.currency),
    durationMin: input.department === 'spa' ? input.durationMin : 0,
  };
}

export function addServiceItem(data: AppData, input: ServiceItemInput): ActionResult {
  const errors = validateServiceItem(data, input);
  if (Object.keys(errors).length) return fail(errors);
  const id = newId();
  const t = nowIso();
  return { ok: true, id, data: { ...data, serviceItems: [...data.serviceItems, { id, ...cleanItem(input), createdAt: t, updatedAt: t }] } };
}

export function updateServiceItem(data: AppData, id: string, input: ServiceItemInput): ActionResult {
  const item = data.serviceItems.find((x) => x.id === id);
  if (!item) return failMsg('العنصر غير موجود.');
  if (item.department !== input.department) return failMsg('لا يمكن نقل عنصر بين الأقسام.');
  const errors = validateServiceItem(data, input, id);
  if (Object.keys(errors).length) return fail(errors);
  return {
    ok: true,
    id,
    data: { ...data, serviceItems: data.serviceItems.map((x) => (x.id === id ? { ...x, ...cleanItem(input), updatedAt: nowIso() } : x)) },
  };
}

export function setServiceItemActive(data: AppData, id: string, active: boolean): ActionResult {
  if (!data.serviceItems.some((x) => x.id === id)) return failMsg('العنصر غير موجود.');
  return {
    ok: true,
    id,
    data: { ...data, serviceItems: data.serviceItems.map((x) => (x.id === id ? { ...x, active, updatedAt: nowIso() } : x)) },
  };
}

export function deleteServiceItem(data: AppData, id: string): ActionResult {
  if (!data.serviceItems.some((x) => x.id === id)) return failMsg('العنصر غير موجود.');
  const used = data.orders.filter((o) => o.lines.some((l) => l.itemId === id)).length;
  if (used > 0)
    return failMsg(`لا يمكن حذف هذا العنصر لأنه مستخدم في ${used} طلب/موعد. يمكنك إيقافه بدلًا من الحذف ليختفي من القوائم الجديدة.`);
  return { ok: true, id, data: { ...data, serviceItems: data.serviceItems.filter((x) => x.id !== id) } };
}

// ---------------------------------------------------------------------------
// Orders / appointments
// ---------------------------------------------------------------------------

export interface OrderInput {
  department: Department;
  date: string;
  time: string;
  billing: OrderBilling;
  reservationId: string;
  customerName: string;
  place: string;
  lines: { itemId: string; qty: number }[];
  /** Direct billing: chosen currency. Room billing: ignored (reservation currency is used). */
  currency: CurrencyCode;
  discount: number;
  method: PaymentMethod;
  rateToBase: number;
  notes: string;
}

/** Resolves the effective currency of an order. */
export function orderCurrency(data: AppData, input: Pick<OrderInput, 'billing' | 'reservationId' | 'currency'>): CurrencyCode {
  if (input.billing === 'room') {
    const r = data.reservations.find((x) => x.id === input.reservationId);
    if (r) return r.currency;
  }
  return input.currency;
}

/** Price of a catalogue item expressed in another currency (using the current exchange rates). */
export function itemPriceIn(data: AppData, itemId: string, currency: CurrencyCode): number | undefined {
  const item = data.serviceItems.find((x) => x.id === itemId);
  if (!item) return undefined;
  if (item.currency === currency) return item.price;
  const from = getRate(data.settings, item.currency);
  const to = getRate(data.settings, currency);
  if (!from || !to) return undefined;
  return convertAmount(item.price, from, to, currency);
}

/** Builds order lines; keeps the price snapshot of lines that already existed on the order. */
function buildLines(data: AppData, input: OrderInput, currency: CurrencyCode, existing?: ServiceOrder): OrderLine[] {
  const merged = new Map<string, number>();
  for (const l of input.lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.qty);
  return [...merged.entries()].map(([itemId, qty]) => {
    const prev = existing && existing.currency === currency ? existing.lines.find((l) => l.itemId === itemId) : undefined;
    const item = data.serviceItems.find((x) => x.id === itemId)!;
    return {
      itemId,
      name: prev?.name ?? item.name,
      qty,
      unitPrice: prev?.unitPrice ?? itemPriceIn(data, itemId, currency) ?? 0,
    };
  });
}

export function validateOrder(data: AppData, input: OrderInput, opts: { excludeId?: string; today?: string } = {}): FieldErrors {
  const e: FieldErrors = {};
  const existing = opts.excludeId ? data.orders.find((o) => o.id === opts.excludeId) : undefined;
  const today = opts.today ?? todayStr();
  if (!DEPARTMENTS.includes(input.department)) e.department = 'القسم غير صحيح.';
  if (!isValidDateStr(input.date)) e.date = 'أدخل تاريخًا صحيحًا.';
  if (!TIME_RE.test(input.time)) e.time = 'أدخل وقتًا صحيحًا.';
  if (input.place.length > 60) e.place = 'النص طويل جدًا.';
  if (input.notes.length > 300) e.notes = 'الملاحظات طويلة جدًا (300 حرف كحد أقصى).';

  // who pays
  if (input.billing === 'room') {
    const r = data.reservations.find((x) => x.id === input.reservationId);
    if (!r) e.reservationId = 'اختر الحجز (الغرفة) الذي سيُحمَّل عليه الحساب.';
    else if (r.status !== 'confirmed' && r.status !== 'checked_in' && !(existing && existing.reservationId === r.id))
      e.reservationId = 'يمكن التحميل على حجز مؤكد أو نزيل داخل الفندق فقط.';
    else if (!e.date && (input.date < r.checkIn || input.date > r.checkOut))
      e.date = `التاريخ يجب أن يكون خلال فترة الإقامة (${r.checkIn} إلى ${r.checkOut}).`;
  } else if (input.billing === 'direct') {
    if (!input.customerName.trim()) e.customerName = 'اسم العميل مطلوب.';
    else if (input.customerName.length > 80) e.customerName = 'الاسم طويل جدًا.';
    if (!enabled(data, input.currency)) e.currency = 'العملة غير مفعّلة في الإعدادات.';
    if (!METHODS.includes(input.method)) e.method = 'اختر طريقة الدفع.';
    if (!isNum(input.rateToBase) || input.rateToBase <= 0) e.rateToBase = 'سعر الصرف يجب أن يكون أكبر من صفر.';
    else if (input.currency === data.settings.baseCurrency && input.rateToBase !== 1) e.rateToBase = 'سعر صرف العملة الأساسية يساوي 1.';
  } else e.billing = 'اختر طريقة المحاسبة.';
  if (!existing && input.date && isValidDateStr(input.date) && input.date < today && input.department === 'spa')
    e.date = 'لا يمكن حجز موعد سبا بتاريخ في الماضي.';

  // lines
  if (!input.lines.length) e.lines = input.department === 'spa' ? 'أضف خدمة واحدة على الأقل.' : 'أضف صنفًا واحدًا على الأقل.';
  for (const l of input.lines) {
    const item = data.serviceItems.find((x) => x.id === l.itemId);
    const wasThere = existing?.lines.some((x) => x.itemId === l.itemId);
    if (!item || item.department !== input.department) {
      e.lines = 'يوجد عنصر غير موجود في القائمة.';
      break;
    }
    if (!item.active && !wasThere) {
      e.lines = `«${item.name}» موقوف حاليًا ولا يمكن طلبه.`;
      break;
    }
    if (!isInt(l.qty) || l.qty < 1 || l.qty > 99) {
      e.lines = 'الكمية يجب أن تكون عددًا صحيحًا بين 1 و 99.';
      break;
    }
  }

  if (!isNum(input.discount) || input.discount < 0) e.discount = 'الخصم لا يمكن أن يكون سالبًا.';

  if (!Object.keys(e).length) {
    const currency = orderCurrency(data, input);
    const lines = buildLines(data, input, currency, existing);
    if (lines.some((l) => !(l.unitPrice > 0))) e.lines = 'تعذّر تحويل سعر أحد العناصر. راجع أسعار الصرف في الإعدادات.';
    else {
      const t = orderTotals({ lines, discount: 0, currency });
      if (input.discount > t.subtotal) e.discount = 'الخصم أكبر من إجمالي الطلب.';
    }
  }
  return e;
}

function buildOrderFields(data: AppData, input: OrderInput, existing?: ServiceOrder) {
  const currency = orderCurrency(data, input);
  const direct = input.billing === 'direct';
  return {
    department: input.department,
    date: input.date,
    time: input.time,
    billing: input.billing,
    reservationId: direct ? '' : input.reservationId,
    customerName: direct ? input.customerName.trim() : '',
    place: input.place.trim(),
    lines: buildLines(data, input, currency, existing),
    currency,
    discount: roundCur(input.discount, currency),
    method: input.method,
    rateToBase: direct ? (currency === data.settings.baseCurrency ? 1 : roundRate(input.rateToBase)) : getRate(data.settings, currency) ?? 1,
    notes: input.notes.trim(),
  };
}

export function addOrder(data: AppData, input: OrderInput, today = todayStr()): ActionResult {
  const errors = validateOrder(data, input, { today });
  if (Object.keys(errors).length) return fail(errors);
  const id = newId();
  const t = nowIso();
  const number = (data.counters.order ?? 0) + 1;
  const order: ServiceOrder = { id, number, ...buildOrderFields(data, input), status: 'open', settled: false, createdAt: t, updatedAt: t };
  return { ok: true, id, data: { ...data, counters: { ...data.counters, order: number }, orders: [...data.orders, order] } };
}

export function updateOrder(data: AppData, id: string, input: OrderInput, today = todayStr()): ActionResult {
  const o = data.orders.find((x) => x.id === id);
  if (!o) return failMsg('الطلب غير موجود.');
  if (o.status !== 'open') return failMsg('لا يمكن تعديل طلب مكتمل أو ملغي.');
  if (o.department !== input.department) return failMsg('لا يمكن نقل طلب بين الأقسام.');
  const errors = validateOrder(data, input, { excludeId: id, today });
  if (Object.keys(errors).length) return fail(errors);
  const next: ServiceOrder = { ...o, ...buildOrderFields(data, input, o), updatedAt: nowIso() };
  const guard = folioGuard(data, o, next);
  if (guard) return failMsg(guard);
  return { ok: true, id, data: { ...data, orders: data.orders.map((x) => (x.id === id ? next : x)) } };
}

/** Prevents a change that would leave a reservation with payments above its new total. */
function folioGuard(data: AppData, before: ServiceOrder, after: ServiceOrder | null): string | null {
  if (before.billing !== 'room') return null;
  const r = data.reservations.find((x) => x.id === before.reservationId);
  if (!r) return null;
  const orders = data.orders.map((x) => (x.id === before.id ? after : x)).filter((x): x is ServiceOrder => Boolean(x));
  const fin = reservationFinance(r, data.payments, orders);
  if (fin.paid > fin.total + 1e-9)
    return `المدفوع على الحجز (${fin.paid} ${currencyInfo(r.currency).symbol}) سيصبح أكبر من إجماليه. عدّل دفعات الحجز أولًا.`;
  return null;
}

/** Marks an order as served / a session as done. Direct orders are settled (paid) at this moment. */
export function completeOrder(data: AppData, id: string, settlement?: { method: PaymentMethod; rateToBase: number }): ActionResult {
  const o = data.orders.find((x) => x.id === id);
  if (!o) return failMsg('الطلب غير موجود.');
  if (o.status !== 'open') return failMsg('هذا الطلب ليس مفتوحًا.');
  let method = o.method;
  let rateToBase = o.rateToBase;
  if (o.billing === 'direct' && settlement) {
    if (!METHODS.includes(settlement.method)) return failMsg('اختر طريقة الدفع.');
    if (!isNum(settlement.rateToBase) || settlement.rateToBase <= 0) return failMsg('سعر الصرف غير صحيح.');
    method = settlement.method;
    rateToBase = o.currency === data.settings.baseCurrency ? 1 : roundRate(settlement.rateToBase);
  }
  if (o.billing === 'room') {
    const r = data.reservations.find((x) => x.id === o.reservationId);
    if (!r) return failMsg('الحجز المرتبط غير موجود.');
  }
  const t = nowIso();
  return {
    ok: true,
    id,
    data: {
      ...data,
      orders: data.orders.map((x) =>
        x.id === id ? { ...x, status: 'completed', settled: x.billing === 'direct', method, rateToBase, updatedAt: t } : x,
      ),
    },
  };
}

export function cancelOrder(data: AppData, id: string): ActionResult {
  const o = data.orders.find((x) => x.id === id);
  if (!o) return failMsg('الطلب غير موجود.');
  if (o.status !== 'open') return failMsg('يمكن إلغاء الطلبات المفتوحة فقط.');
  const next: ServiceOrder = { ...o, status: 'cancelled', updatedAt: nowIso() };
  const guard = folioGuard(data, o, next);
  if (guard) return failMsg(guard);
  return { ok: true, id, data: { ...data, orders: data.orders.map((x) => (x.id === id ? next : x)) } };
}

export function deleteOrder(data: AppData, id: string): ActionResult {
  const o = data.orders.find((x) => x.id === id);
  if (!o) return failMsg('الطلب غير موجود.');
  if (o.status === 'completed') return failMsg('لا يمكن حذف طلب مكتمل لأنه جزء من السجل المالي.');
  const guard = folioGuard(data, o, null);
  if (guard) return failMsg(guard);
  return { ok: true, id, data: { ...data, orders: data.orders.filter((x) => x.id !== id) } };
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/** Revenue (base currency) of a settled direct order. Room-charged orders are paid via reservation payments. */
export function directOrderRevenueBase(data: AppData, o: ServiceOrder): number {
  if (o.billing !== 'direct' || !o.settled || o.status !== 'completed') return 0;
  return toBase(orderTotals(o).total, o.rateToBase, data.settings);
}

/** Sales value of an order in base currency (any billing; cancelled = 0). Uses the stored rate snapshot. */
export function orderSalesBase(data: AppData, o: ServiceOrder): number {
  if (o.status === 'cancelled') return 0;
  return toBase(orderTotals(o).total, o.rateToBase, data.settings);
}

export interface DepartmentSummary {
  department: Department;
  count: number;
  salesBase: number;
  roomChargedBase: number;
  directBase: number;
  byCategory: { category: string; base: number; qty: number }[];
  topItems: { name: string; qty: number; base: number }[];
}

export function departmentSummary(data: AppData, department: Department, range: { from: string; to: string }): DepartmentSummary {
  const base = data.settings.baseCurrency;
  const list = data.orders.filter((o) => o.department === department && o.status !== 'cancelled' && o.date >= range.from && o.date <= range.to);
  let sales = 0;
  let room = 0;
  let direct = 0;
  const cat = new Map<string, { base: number; qty: number }>();
  const items = new Map<string, { name: string; qty: number; base: number }>();
  for (const o of list) {
    const total = orderSalesBase(data, o);
    sales += total;
    if (o.billing === 'room') room += total;
    else direct += total;
    const t = orderTotals(o);
    const ratio = t.subtotal > 0 ? t.total / t.subtotal : 0;
    for (const l of o.lines) {
      const lineBase = toBase(l.qty * l.unitPrice * ratio, o.rateToBase, data.settings);
      const item = data.serviceItems.find((x) => x.id === l.itemId);
      const c = item?.category ?? 'أخرى';
      const a = cat.get(c) ?? { base: 0, qty: 0 };
      cat.set(c, { base: a.base + lineBase, qty: a.qty + l.qty });
      const b = items.get(l.itemId) ?? { name: l.name, qty: 0, base: 0 };
      items.set(l.itemId, { name: b.name, qty: b.qty + l.qty, base: b.base + lineBase });
    }
  }
  return {
    department,
    count: list.length,
    salesBase: roundCur(sales, base),
    roomChargedBase: roundCur(room, base),
    directBase: roundCur(direct, base),
    byCategory: [...cat.entries()].map(([category, v]) => ({ category, base: roundCur(v.base, base), qty: v.qty })).sort((a, b) => b.base - a.base),
    topItems: [...items.values()].map((v) => ({ ...v, base: roundCur(v.base, base) })).sort((a, b) => b.qty - a.qty).slice(0, 8),
  };
}

