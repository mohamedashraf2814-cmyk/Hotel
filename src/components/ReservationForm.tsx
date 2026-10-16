import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { addReservation, updateReservation, type ReservationInput } from '../lib/actions';
import { roundCur } from '../lib/currencies';
import { nightsBetween } from '../lib/dates';
import { ROOM_TYPE_LABELS } from '../lib/labels';
import { convertAmount, findConflict, getRate, reservationTotals } from '../lib/logic';
import type { FieldErrors, Reservation } from '../lib/types';
import { currencyOptions, numStr, toNum } from '../lib/ui-helpers';
import { useFmt, useToday } from '../hooks/useApp';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';
import GuestForm from './GuestForm';
import { Alert, Button, Modal, SelectField, TextAreaField, TextField } from './ui';

export default function ReservationForm({
  reservation,
  presetRoomId,
  onClose,
}: {
  reservation?: Reservation;
  presetRoomId?: string;
  onClose: () => void;
}) {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const today = useToday();
  const s = data.settings;
  const running = reservation?.status === 'checked_in';
  const hasPayments = reservation ? data.payments.some((p) => p.reservationId === reservation.id) : false;

  const presetRoom = presetRoomId ? data.rooms.find((r) => r.id === presetRoomId) : undefined;
  const [v, setV] = useState({
    guestId: reservation?.guestId ?? '',
    roomId: reservation?.roomId ?? presetRoom?.id ?? '',
    checkIn: reservation?.checkIn ?? today,
    checkOut: reservation?.checkOut ?? '',
    guestsCount: reservation ? String(reservation.guestsCount) : '1',
    currency: reservation?.currency ?? presetRoom?.currency ?? s.baseCurrency,
    pricePerNight: reservation ? numStr(reservation.pricePerNight) : presetRoom ? numStr(presetRoom.pricePerNight) : '',
    discount: reservation ? numStr(reservation.discount) : '0',
    notes: reservation?.notes ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [addingGuest, setAddingGuest] = useState(false);
  const [rateNote, setRateNote] = useState('');
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const onRoomChange = (id: string) => {
    const room = data.rooms.find((r) => r.id === id);
    setRateNote('');
    setV((p) => {
      if (!room || hasPayments) return { ...p, roomId: id };
      return { ...p, roomId: id, currency: room.currency, pricePerNight: numStr(room.pricePerNight) };
    });
  };

  const onCurrencyChange = (code: string) => {
    const from = getRate(s, v.currency);
    const to = getRate(s, code);
    const price = toNum(v.pricePerNight);
    const disc = toNum(v.discount);
    if (from && to && Number.isFinite(price)) {
      setRateNote(`تم تحويل السعر من ${v.currency} إلى ${code} بسعر الصرف المسجل في الإعدادات. راجع القيم قبل الحفظ.`);
      setV((p) => ({
        ...p,
        currency: code,
        pricePerNight: numStr(convertAmount(price, from, to, code)),
        discount: Number.isFinite(disc) ? numStr(convertAmount(disc, from, to, code)) : p.discount,
      }));
    } else {
      setV((p) => ({ ...p, currency: code }));
    }
  };

  const priceN = toNum(v.pricePerNight);
  const discN = toNum(v.discount);
  const nights = nightsBetween(v.checkIn, v.checkOut);
  const totals =
    nights > 0 && Number.isFinite(priceN) && priceN > 0
      ? reservationTotals({ checkIn: v.checkIn, checkOut: v.checkOut, pricePerNight: priceN, discount: Number.isFinite(discN) && discN > 0 ? discN : 0, currency: v.currency })
      : undefined;

  const room = data.rooms.find((r) => r.id === v.roomId);
  const conflict =
    v.roomId && nights > 0
      ? findConflict(data.reservations, { roomId: v.roomId, checkIn: v.checkIn, checkOut: v.checkOut, excludeId: reservation?.id })
      : undefined;

  const roomOptions = useMemo(
    () =>
      [...data.rooms]
        .sort((a, b) => a.number.localeCompare(b.number, 'ar', { numeric: true }))
        .map((r) => ({
          value: r.id,
          label: `${r.number} — ${ROOM_TYPE_LABELS[r.type]} — سعة ${r.capacity} — ${f.money(r.pricePerNight, r.currency)}`,
        })),
    [data.rooms, f],
  );
  const guestOptions = useMemo(
    () =>
      [...data.guests]
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'))
        .map((g) => ({ value: g.id, label: `${g.fullName} — ${g.phone}` })),
    [data.guests],
  );

  const submit = () => {
    const input: ReservationInput = {
      guestId: v.guestId,
      roomId: v.roomId,
      checkIn: v.checkIn,
      checkOut: v.checkOut,
      guestsCount: toNum(v.guestsCount),
      currency: v.currency,
      pricePerNight: priceN,
      discount: Number.isNaN(discN) ? (v.discount.trim() === '' ? 0 : NaN) : discN,
      notes: v.notes,
    };
    const res = run((d) => (reservation ? updateReservation(d, reservation.id, input) : addReservation(d, input)));
    if (res.ok) {
      toast.success(reservation ? 'تم حفظ تعديلات الحجز.' : 'تم إنشاء الحجز.');
      onClose();
    } else if (res.errors) setErrors(res.errors);
    else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  const noPrereq = data.rooms.length === 0;

  return (
    <>
      <Modal
        title={reservation ? 'تعديل الحجز' : 'حجز جديد'}
        size="lg"
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>إلغاء</Button>
            <Button variant="primary" onClick={submit} disabled={noPrereq}>
              {reservation ? 'حفظ التعديلات' : 'إنشاء الحجز'}
            </Button>
          </>
        }
      >
        {noPrereq ? (
          <Alert tone="warning">أضف غرفة واحدة على الأقل من صفحة «الغرف» قبل إنشاء حجز.</Alert>
        ) : (
          <form
            className="form-grid"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {running ? (
              <div className="span-2">
                <Alert tone="info">النزيل داخل الفندق: يمكن تعديل تاريخ المغادرة والسعر والخصم وعدد النزلاء والملاحظات فقط.</Alert>
              </div>
            ) : null}
            <div className="field">
              <SelectField
                label="النزيل"
                required
                value={v.guestId}
                onChange={set('guestId')}
                placeholder={guestOptions.length ? 'اختر النزيل' : 'لا يوجد نزلاء — أضف نزيلًا'}
                options={guestOptions}
                error={errors.guestId}
                disabled={running}
              />
              {!running ? (
                <div>
                  <Button small variant="ghost" onClick={() => setAddingGuest(true)}>
                    <UserPlus size={15} /> نزيل جديد
                  </Button>
                </div>
              ) : null}
            </div>
            <SelectField
              label="الغرفة"
              required
              value={v.roomId}
              onChange={onRoomChange}
              placeholder="اختر الغرفة"
              options={roomOptions}
              error={errors.roomId}
              disabled={running}
            />
            <TextField label="تاريخ الدخول" required type="date" value={v.checkIn} onChange={set('checkIn')} error={errors.checkIn} disabled={running} />
            <TextField label="تاريخ المغادرة" required type="date" value={v.checkOut} min={v.checkIn} onChange={set('checkOut')} error={errors.checkOut} />
            {conflict ? (
              <div className="span-2">
                <Alert tone="danger">
                  هذه الغرفة محجوزة في الفترة المختارة (حجز #{String(conflict.number).padStart(4, '0')} من {f.date(conflict.checkIn)} إلى {f.date(conflict.checkOut)}).
                </Alert>
              </div>
            ) : null}
            <TextField
              label={`عدد النزلاء${room ? ` (السعة ${room.capacity})` : ''}`}
              required
              type="number"
              inputMode="numeric"
              min={1}
              value={v.guestsCount}
              onChange={set('guestsCount')}
              error={errors.guestsCount}
            />
            <SelectField
              label="عملة الحجز"
              required
              value={v.currency}
              onChange={onCurrencyChange}
              options={currencyOptions(s)}
              error={errors.currency}
              disabled={hasPayments}
              hint={hasPayments ? 'لا يمكن تغيير العملة بعد تسجيل دفعات.' : undefined}
            />
            <TextField label="سعر الليلة" required type="number" inputMode="decimal" step="any" min={0} value={v.pricePerNight} onChange={set('pricePerNight')} error={errors.pricePerNight} />
            <TextField label="الخصم (مبلغ)" type="number" inputMode="decimal" step="any" min={0} value={v.discount} onChange={set('discount')} error={errors.discount} />
            {rateNote ? (
              <div className="span-2">
                <Alert tone="info">{rateNote}</Alert>
              </div>
            ) : null}
            <div className="span-2 card" style={{ padding: 14, background: '#F8FAFC' }} aria-live="polite">
              {totals ? (
                <dl className="kv kv-4">
                  <div><dt>عدد الليالي</dt><dd>{f.int(totals.nights)}</dd></div>
                  <div><dt>إجمالي الإقامة</dt><dd>{f.money(totals.subtotal, v.currency)}</dd></div>
                  <div><dt>الخصم</dt><dd>{f.money(totals.discount, v.currency)}</dd></div>
                  <div><dt>الإجمالي المستحق</dt><dd style={{ color: 'var(--blue)', fontWeight: 700 }}>{f.money(totals.total, v.currency)}</dd></div>
                </dl>
              ) : (
                <span className="muted">أدخل التواريخ والسعر لعرض الإجمالي.</span>
              )}
              {totals && reservation && Number.isFinite(totals.total) ? (
                <div className="hint" style={{ marginTop: 6 }}>
                  المدفوع سابقًا: {f.money(roundCur(data.payments.filter((p) => p.reservationId === reservation.id).reduce((a, p) => a + p.appliedAmount, 0), v.currency), v.currency)}
                </div>
              ) : null}
            </div>
            <TextAreaField label="ملاحظات" value={v.notes} onChange={set('notes')} error={errors.notes} className="span-2" maxLength={500} />
            <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
          </form>
        )}
      </Modal>
      {addingGuest ? <GuestForm onClose={() => setAddingGuest(false)} onSaved={(id) => id && set('guestId')(id)} /> : null}
    </>
  );
}
