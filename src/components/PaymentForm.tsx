import { useMemo, useState } from 'react';
import { PAYMENT_METHODS, addPayment, computeApplied, updatePayment, type PaymentInput } from '../lib/actions';
import { currencyInfo, roundCur } from '../lib/currencies';
import { PAYMENT_METHOD_LABELS } from '../lib/labels';
import { getRate, guestById, reservationFinance, reservationLabel, roomById } from '../lib/logic';
import type { FieldErrors, Payment, PaymentMethod } from '../lib/types';
import { currencyOptions, numStr, toNum } from '../lib/ui-helpers';
import { useFmt, useToday } from '../hooks/useApp';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';
import { Alert, Button, Modal, SelectField, TextField } from './ui';

export default function PaymentForm({
  payment,
  reservationId,
  onClose,
}: {
  payment?: Payment;
  reservationId?: string;
  onClose: () => void;
}) {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const today = useToday();
  const s = data.settings;

  const initialRes = payment?.reservationId ?? reservationId ?? '';
  const initialResObj = data.reservations.find((r) => r.id === initialRes);
  const initialCurrency = payment?.currency ?? initialResObj?.currency ?? s.baseCurrency;

  const [v, setV] = useState({
    reservationId: initialRes,
    date: payment?.date ?? today,
    amount: payment ? numStr(payment.amount) : '',
    currency: initialCurrency,
    rateToBase: payment ? numStr(payment.rateToBase) : numStr(getRate(s, initialCurrency) ?? 1),
    method: (payment?.method ?? 'cash') as PaymentMethod,
    reference: payment?.reference ?? '',
    notes: payment?.notes ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const options = useMemo(() => {
    return data.reservations
      .filter((r) => {
        if (payment && r.id === payment.reservationId) return true;
        if (r.status === 'cancelled') return false;
        return reservationFinance(r, data.payments).balance > 0;
      })
      .sort((a, b) => b.number - a.number)
      .map((r) => {
        const fin = reservationFinance(r, data.payments);
        const g = guestById(data, r.guestId)?.fullName ?? '—';
        const rm = roomById(data, r.roomId)?.number ?? '—';
        return { value: r.id, label: `${reservationLabel(r)} — ${g} — غرفة ${rm} — المتبقي ${f.money(fin.balance, r.currency)}` };
      });
  }, [data, payment, f]);

  const res = data.reservations.find((r) => r.id === v.reservationId);
  const finance = res ? reservationFinance(res, data.payments.filter((p) => p.id !== payment?.id)) : undefined;

  const onReservationChange = (id: string) => {
    const r = data.reservations.find((x) => x.id === id);
    setV((p) => ({
      ...p,
      reservationId: id,
      currency: r ? r.currency : p.currency,
      rateToBase: r ? numStr(getRate(s, r.currency) ?? 1) : p.rateToBase,
    }));
  };

  const onCurrencyChange = (code: string) => {
    setV((p) => ({ ...p, currency: code, rateToBase: numStr(getRate(s, code) ?? 1) }));
  };

  const amountN = toNum(v.amount);
  const rateN = toNum(v.rateToBase);
  const applied =
    res && Number.isFinite(amountN) && amountN > 0 && Number.isFinite(rateN) && rateN > 0
      ? computeApplied(data, { amount: amountN, currency: v.currency, rateToBase: rateN }, res.currency)
      : undefined;

  const payFull = () => {
    if (!res || !finance) return;
    const remaining = finance.balance;
    if (v.currency === res.currency) {
      set('amount')(numStr(remaining));
      return;
    }
    const resRate = getRate(s, res.currency);
    const payRate = Number.isFinite(rateN) && rateN > 0 ? rateN : getRate(s, v.currency);
    if (!resRate || !payRate) return;
    const d = currencyInfo(v.currency).decimals;
    const factor = 10 ** d;
    // round down so the converted amount never exceeds the remaining balance
    set('amount')(numStr(Math.floor(((remaining * resRate) / payRate) * factor + 1e-9) / factor));
  };

  const submit = () => {
    const input: PaymentInput = {
      reservationId: v.reservationId,
      date: v.date,
      amount: amountN,
      currency: v.currency,
      rateToBase: v.currency === s.baseCurrency ? 1 : rateN,
      method: v.method,
      reference: v.reference,
      notes: v.notes,
    };
    const r = run((d) => (payment ? updatePayment(d, payment.id, input) : addPayment(d, input)));
    if (r.ok) {
      toast.success(payment ? 'تم حفظ تعديلات الدفعة.' : 'تم تسجيل الدفعة.');
      onClose();
    } else if (r.errors) setErrors(r.errors);
    else toast.error(r.error ?? 'تعذّر الحفظ.');
  };

  const isBase = v.currency === s.baseCurrency;

  return (
    <Modal
      title={payment ? 'تعديل دفعة' : 'تسجيل دفعة'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit}>
            {payment ? 'حفظ التعديلات' : 'تسجيل الدفعة'}
          </Button>
        </>
      }
    >
      <form
        className="form-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <SelectField
          label="الحجز"
          required
          value={v.reservationId}
          onChange={onReservationChange}
          placeholder={options.length ? 'اختر الحجز' : 'لا توجد حجوزات عليها مبالغ مستحقة'}
          options={options}
          error={errors.reservationId}
          className="span-2"
          disabled={Boolean(payment)}
        />
        {res && finance ? (
          <div className="span-2">
            <Alert tone="info">
              إجمالي الحجز {f.money(finance.total, res.currency)} · المدفوع {f.money(finance.paid, res.currency)} · المتبقي{' '}
              <strong>{f.money(finance.balance, res.currency)}</strong>
            </Alert>
          </div>
        ) : null}
        <TextField label="تاريخ الدفع" required type="date" value={v.date} max={today} onChange={set('date')} error={errors.date} />
        <SelectField
          label="طريقة الدفع"
          required
          value={v.method}
          onChange={(x) => set('method')(x as PaymentMethod)}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
          error={errors.method}
        />
        <SelectField label="عملة الدفع" required value={v.currency} onChange={onCurrencyChange} options={currencyOptions(s)} error={errors.currency} />
        <TextField
          label={`سعر الصرف (1 ${v.currency} = ؟ ${s.baseCurrency})`}
          required
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={isBase ? '1' : v.rateToBase}
          onChange={set('rateToBase')}
          error={errors.rateToBase}
          disabled={isBase}
          hint={isBase ? 'العملة الأساسية سعرها 1.' : 'يُحفظ مع الدفعة ولا يتأثر بتغيير الأسعار لاحقًا.'}
        />
        <TextField label="المبلغ المدفوع" required type="number" inputMode="decimal" step="any" min={0} value={v.amount} onChange={set('amount')} error={errors.amount} />
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <Button small onClick={payFull} disabled={!res}>
            سداد كامل المتبقي
          </Button>
        </div>
        {res && applied !== undefined && finance ? (
          <div className="span-2">
            <Alert tone="success">
              {v.currency !== res.currency ? <>يعادل {f.money(applied, res.currency)} من الحجز · </> : null}
              المتبقي بعد الدفعة: <strong>{f.money(roundCur(finance.balance - applied, res.currency), res.currency)}</strong>
            </Alert>
          </div>
        ) : null}
        <TextField label="مرجع العملية (اختياري)" value={v.reference} onChange={set('reference')} error={errors.reference} maxLength={60} />
        <TextField label="ملاحظات (اختياري)" value={v.notes} onChange={set('notes')} error={errors.notes} maxLength={300} />
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
