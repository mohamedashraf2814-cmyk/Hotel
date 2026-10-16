import { useMemo, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { PAYMENT_METHODS } from '../lib/actions';
import { currencyInfo, roundCur } from '../lib/currencies';
import { PAYMENT_METHOD_LABELS } from '../lib/labels';
import { getRate, guestById, orderTotals, reservationLabel, roomById } from '../lib/logic';
import { addOrder, itemPriceIn, orderCurrency, updateOrder, type OrderInput } from '../lib/services';
import type { Department, FieldErrors, OrderBilling, PaymentMethod, ServiceOrder } from '../lib/types';
import { currencyOptions, numStr, toNum } from '../lib/ui-helpers';
import { useFmt, useToday } from '../hooks/useApp';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';
import { Alert, Button, IconButton, Modal, SelectField, TextAreaField, TextField } from './ui';

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function OrderForm({ department, order, onClose }: { department: Department; order?: ServiceOrder; onClose: () => void }) {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const today = useToday();
  const s = data.settings;
  const spa = department === 'spa';

  const [v, setV] = useState({
    billing: (order?.billing ?? 'room') as OrderBilling,
    reservationId: order?.reservationId ?? '',
    customerName: order?.customerName ?? '',
    date: order?.date ?? today,
    time: order?.time ?? (spa ? '' : nowTime()),
    place: order?.place ?? '',
    currency: order?.currency ?? s.baseCurrency,
    rateToBase: order ? numStr(order.rateToBase) : '1',
    method: (order?.method ?? 'cash') as PaymentMethod,
    discount: order ? numStr(order.discount) : '0',
    notes: order?.notes ?? '',
  });
  const [lines, setLines] = useState<{ itemId: string; qty: number }[]>(order ? order.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })) : []);
  const [picker, setPicker] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const activeRes = useMemo(
    () =>
      data.reservations
        .filter((r) => r.status === 'checked_in' || r.status === 'confirmed' || r.id === order?.reservationId)
        .sort((a, b) => (a.status === b.status ? b.number - a.number : a.status === 'checked_in' ? -1 : 1))
        .map((r) => ({
          value: r.id,
          label: `غرفة ${roomById(data, r.roomId)?.number ?? '—'} — ${guestById(data, r.guestId)?.fullName ?? '—'} — ${reservationLabel(r)}${r.status === 'checked_in' ? ' (داخل الفندق)' : ''}`,
        })),
    [data, order],
  );

  const items = data.serviceItems.filter((x) => x.department === department && (x.active || lines.some((l) => l.itemId === x.id)));
  const byCategory = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items.filter((x) => x.active)) m.set(it.category, [...(m.get(it.category) ?? []), it]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  }, [items]);

  const currency = orderCurrency(data, v);
  const priceOf = (itemId: string) => {
    const prev = order && order.currency === currency ? order.lines.find((l) => l.itemId === itemId) : undefined;
    return prev?.unitPrice ?? itemPriceIn(data, itemId, currency) ?? 0;
  };
  const previewLines = lines.map((l) => ({ itemId: l.itemId, name: data.serviceItems.find((x) => x.id === l.itemId)?.name ?? '', qty: l.qty, unitPrice: priceOf(l.itemId) }));
  const discN = toNum(v.discount);
  const totals = orderTotals({ lines: previewLines, discount: Number.isFinite(discN) && discN > 0 ? discN : 0, currency });

  const addLine = (itemId: string) => {
    if (!itemId) return;
    setLines((p) => (p.some((l) => l.itemId === itemId) ? p.map((l) => (l.itemId === itemId ? { ...l, qty: Math.min(99, l.qty + 1) } : l)) : [...p, { itemId, qty: 1 }]));
    setPicker('');
  };
  const changeQty = (itemId: string, d: number) =>
    setLines((p) => p.map((l) => (l.itemId === itemId ? { ...l, qty: Math.max(1, Math.min(99, l.qty + d)) } : l)));

  const submit = () => {
    const input: OrderInput = {
      department,
      date: v.date,
      time: v.time,
      billing: v.billing,
      reservationId: v.reservationId,
      customerName: v.customerName,
      place: v.place,
      lines,
      currency: v.currency,
      discount: v.discount.trim() === '' ? 0 : discN,
      method: v.method,
      rateToBase: v.currency === s.baseCurrency ? 1 : toNum(v.rateToBase),
      notes: v.notes,
    };
    const res = run((d) => (order ? updateOrder(d, order.id, input) : addOrder(d, input)));
    if (res.ok) {
      toast.success(order ? 'تم حفظ التعديلات.' : spa ? 'تم حجز الموعد.' : 'تم تسجيل الطلب.');
      onClose();
    } else if (res.errors) setErrors(res.errors);
    else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  const noItems = data.serviceItems.filter((x) => x.department === department && x.active).length === 0 && !order;
  const title = order ? (spa ? 'تعديل موعد' : 'تعديل طلب') : spa ? 'حجز موعد سبا' : 'طلب جديد من المطعم';

  return (
    <Modal
      title={title}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit} disabled={noItems}>
            {order ? 'حفظ التعديلات' : spa ? 'حجز الموعد' : 'تسجيل الطلب'}
          </Button>
        </>
      }
    >
      {noItems ? (
        <Alert tone="warning">
          {spa ? 'أضف خدمات السبا أولًا من تبويب «قائمة الخدمات».' : 'أضف أصناف المطعم أولًا من تبويب «قائمة الطعام».'}
        </Alert>
      ) : (
        <form
          className="form-grid"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="span-2 field">
            <span className="label">طريقة المحاسبة</span>
            <div className="seg" role="radiogroup" aria-label="طريقة المحاسبة">
              {(['room', 'direct'] as OrderBilling[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={v.billing === b}
                  className={`seg-btn ${v.billing === b ? 'on' : ''}`}
                  onClick={() => set('billing')(b)}
                  disabled={Boolean(order)}
                >
                  {b === 'room' ? 'على حساب الغرفة' : spa ? 'عميل خارجي — دفع مباشر' : 'زائر — دفع مباشر'}
                </button>
              ))}
            </div>
          </div>

          {v.billing === 'room' ? (
            <SelectField
              label="النزيل / الغرفة"
              required
              value={v.reservationId}
              onChange={set('reservationId')}
              placeholder={activeRes.length ? 'اختر النزيل' : 'لا توجد حجوزات نشطة'}
              options={activeRes}
              error={errors.reservationId}
              className="span-2"
              hint="يُضاف المبلغ إلى فاتورة الإقامة ويُسدَّد مع دفعات الحجز، بعملة الحجز."
            />
          ) : (
            <>
              <TextField label="اسم العميل" required value={v.customerName} onChange={set('customerName')} error={errors.customerName} />
              <SelectField
                label="العملة"
                required
                value={v.currency}
                onChange={(code) => setV((p) => ({ ...p, currency: code, rateToBase: numStr(getRate(s, code) ?? 1) }))}
                options={currencyOptions(s)}
                error={errors.currency}
              />
            </>
          )}

          <TextField label={spa ? 'تاريخ الموعد' : 'التاريخ'} required type="date" value={v.date} onChange={set('date')} error={errors.date} />
          <TextField label={spa ? 'وقت الموعد' : 'الوقت'} required type="time" value={v.time} onChange={set('time')} error={errors.time} />
          <TextField
            label={spa ? 'المعالج / المعالجة' : 'الطاولة / المكان'}
            value={v.place}
            onChange={set('place')}
            error={errors.place}
            placeholder={spa ? 'اختياري' : 'مثال: طاولة 4، خدمة الغرف'}
            maxLength={60}
          />
          <TextField label="الخصم (مبلغ)" type="number" inputMode="decimal" step="any" min={0} value={v.discount} onChange={set('discount')} error={errors.discount} />

          <div className="span-2 field">
            <SelectField
              label={spa ? 'إضافة خدمة' : 'إضافة صنف'}
              value={picker}
              onChange={addLine}
              placeholder={spa ? 'اختر خدمة…' : 'اختر صنفًا…'}
              options={byCategory.flatMap(([cat, list]) =>
                list.map((it) => ({
                  value: it.id,
                  label: `${cat} — ${it.name}${it.durationMin ? ` (${it.durationMin} د)` : ''} — ${f.money(priceOf(it.id), currency)}`,
                })),
              )}
            />
            {errors.lines ? <span className="field-error" role="alert">{errors.lines}</span> : null}
          </div>

          <div className="span-2">
            {previewLines.length === 0 ? (
              <div className="muted lines-empty">لم تتم إضافة {spa ? 'خدمات' : 'أصناف'} بعد.</div>
            ) : (
              <ul className="lines">
                {previewLines.map((l) => (
                  <li key={l.itemId}>
                    <span className="lines-name">{l.name}</span>
                    <span className="qty">
                      <IconButton label="إنقاص الكمية" onClick={() => changeQty(l.itemId, -1)} disabled={l.qty <= 1}>
                        <Minus size={15} />
                      </IconButton>
                      <span className="num" aria-label="الكمية">{f.int(l.qty)}</span>
                      <IconButton label="زيادة الكمية" onClick={() => changeQty(l.itemId, 1)}>
                        <Plus size={15} />
                      </IconButton>
                    </span>
                    <span className="num lines-amt">{f.money(roundCur(l.qty * l.unitPrice, currency), currency)}</span>
                    <IconButton label="إزالة" danger onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))}>
                      <Trash2 size={15} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {v.billing === 'direct' ? (
            <>
              <SelectField
                label="طريقة الدفع"
                value={v.method}
                onChange={(x) => set('method')(x as PaymentMethod)}
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
                error={errors.method}
              />
              <TextField
                label={`سعر الصرف (1 ${v.currency} = ؟ ${s.baseCurrency})`}
                type="number"
                inputMode="decimal"
                step="any"
                value={v.currency === s.baseCurrency ? '1' : v.rateToBase}
                disabled={v.currency === s.baseCurrency}
                onChange={set('rateToBase')}
                error={errors.rateToBase}
              />
            </>
          ) : null}

          <div className="span-2 card totals-box" aria-live="polite">
            <dl className="kv kv-4">
              <div><dt>عدد {spa ? 'الخدمات' : 'الأصناف'}</dt><dd>{f.int(lines.reduce((a, l) => a + l.qty, 0))}</dd></div>
              <div><dt>الإجمالي</dt><dd>{f.money(totals.subtotal, currency)}</dd></div>
              <div><dt>الخصم</dt><dd>{f.money(totals.discount, currency)}</dd></div>
              <div><dt>المستحق</dt><dd className="accent">{f.money(totals.total, currency)}</dd></div>
            </dl>
            {v.billing === 'room' && v.reservationId ? (
              <div className="hint">سيُضاف إلى فاتورة الإقامة بعملة الحجز ({currencyInfo(currency).nameAr}).</div>
            ) : null}
          </div>

          <TextAreaField label="ملاحظات" value={v.notes} onChange={set('notes')} error={errors.notes} className="span-2" maxLength={300} />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
}
