import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Printer, Wallet } from 'lucide-react';
import { useState } from 'react';
import { MethodLabel } from '../components/badges';
import PaymentForm from '../components/PaymentForm';
import { Button, EmptyState } from '../components/ui';
import { useFmt, useToday } from '../hooks/useApp';
import { RESERVATION_STATUS_LABELS, ROOM_TYPE_LABELS } from '../lib/labels';
import { guestById, orderTotals, reservationFinance, reservationLabel, roomById, roomChargesOf } from '../lib/logic';
import { DEPARTMENT_LABELS } from '../lib/labels';
import { orderLabel } from '../lib/services';
import { useData } from '../store/DataContext';

export default function Invoice() {
  const { reservationId } = useParams();
  const { data } = useData();
  const f = useFmt();
  const today = useToday();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);

  const res = data.reservations.find((r) => r.id === reservationId);
  if (!res) {
    return (
      <div className="card">
        <EmptyState
          title="الفاتورة غير موجودة"
          text="لم نعثر على حجز بهذا الرابط. ربما تم حذفه."
          action={
            <Link to="/payments" className="btn btn-primary">
              العودة للمدفوعات
            </Link>
          }
        />
      </div>
    );
  }

  const s = data.settings;
  const guest = guestById(data, res.guestId);
  const room = roomById(data, res.roomId);
  const fin = reservationFinance(res, data.payments, data.orders);
  const charges = roomChargesOf(data.orders, res.id).sort((a, b) => (`${a.date} ${a.time}` < `${b.date} ${b.time}` ? -1 : 1));
  const pays = data.payments.filter((p) => p.reservationId === res.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
  const invNo = `INV-${String(res.number).padStart(4, '0')}`;

  return (
    <>
      <div className="row no-print" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowRight size={18} /> رجوع
        </Button>
        <div className="row">
          {res.status !== 'cancelled' && fin.balance > 0 ? (
            <Button onClick={() => setPaying(true)}>
              <Wallet size={17} /> تسجيل دفعة
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => window.print()}>
            <Printer size={17} /> طباعة / حفظ PDF
          </Button>
        </div>
      </div>

      <article className="invoice" aria-label={`فاتورة ${invNo}`}>
        <div className="invoice-head">
          <div>
            <h1>{s.hotelName}</h1>
            {s.address ? <div className="muted">{s.address}</div> : null}
            {s.phone ? <div className="muted">الهاتف: <span className="ltr">{s.phone}</span></div> : null}
            {s.email ? <div className="muted"><span className="ltr">{s.email}</span></div> : null}
            {s.website ? <div className="muted"><span className="ltr">{s.website}</span></div> : null}
          </div>
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>فاتورة</div>
            <div>رقم الفاتورة: <strong>{invNo}</strong></div>
            <div>رقم الحجز: {reservationLabel(res)}</div>
            <div>تاريخ الإصدار: {f.date(today)}</div>
            <div>الحالة: {RESERVATION_STATUS_LABELS[res.status]}</div>
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 20 }}>
          <div className="box">
            <div className="muted" style={{ marginBottom: 4 }}>بيانات النزيل</div>
            <div className="strong">{guest?.fullName ?? '—'}</div>
            {guest?.phone ? <div><span className="ltr">{guest.phone}</span></div> : null}
            {guest?.email ? <div><span className="ltr">{guest.email}</span></div> : null}
            {guest?.nationality ? <div>{guest.nationality}</div> : null}
          </div>
          <div className="box">
            <div className="muted" style={{ marginBottom: 4 }}>تفاصيل الإقامة</div>
            <div>الغرفة: <strong>{room?.number ?? '—'}</strong> {room ? `(${ROOM_TYPE_LABELS[room.type]})` : ''}</div>
            <div>الدخول: {f.date(res.checkIn)}</div>
            <div>المغادرة: {f.date(res.checkOut)}</div>
            <div>عدد النزلاء: {f.int(res.guestsCount)}</div>
          </div>
        </div>

        <table style={{ marginTop: 22 }}>
          <thead>
            <tr>
              <th>البيان</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th style={{ textAlign: 'end' }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>إقامة — غرفة {room?.number ?? ''}</td>
              <td>{f.int(fin.nights)} ليلة</td>
              <td>{f.money(res.pricePerNight, res.currency)}</td>
              <td style={{ textAlign: 'end' }}>{f.money(fin.subtotal, res.currency)}</td>
            </tr>
            {fin.discount > 0 ? (
              <tr>
                <td>خصم الإقامة</td>
                <td>—</td>
                <td>—</td>
                <td style={{ textAlign: 'end' }}>- {f.money(fin.discount, res.currency)}</td>
              </tr>
            ) : null}
            {charges.map((o) => {
              const t = orderTotals(o);
              return (
                <tr key={o.id}>
                  <td>
                    {DEPARTMENT_LABELS[o.department]} — {o.lines.map((l) => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name)).join('، ')}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {orderLabel(o)} · {f.date(o.date)} {o.time}
                      {t.discount > 0 ? ` · خصم ${f.money(t.discount, res.currency)}` : ''}
                    </div>
                  </td>
                  <td>{f.int(o.lines.reduce((a, l) => a + l.qty, 0))}</td>
                  <td>—</td>
                  <td style={{ textAlign: 'end' }}>{f.money(t.total, res.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="totals">
          <div><span>الإقامة</span><span>{f.money(fin.roomTotal, res.currency)}</span></div>
          {fin.extras > 0 ? <div><span>السبا والمطعم</span><span>{f.money(fin.extras, res.currency)}</span></div> : null}
          <div className="grand"><span>الإجمالي المستحق</span><span>{f.money(fin.total, res.currency)}</span></div>
          <div><span>المدفوع</span><span>{f.money(fin.paid, res.currency)}</span></div>
          <div className="grand" style={{ color: fin.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
            <span>المتبقي</span>
            <span>{f.money(fin.balance, res.currency)}</span>
          </div>
        </div>

        <h3 style={{ marginTop: 26, fontSize: 15 }}>سجل الدفعات</h3>
        {pays.length === 0 ? (
          <p className="muted">لا توجد دفعات مسجلة.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الطريقة</th>
                <th>المبلغ المدفوع</th>
                <th style={{ textAlign: 'end' }}>المحتسب على الفاتورة</th>
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td>{f.date(p.date)}</td>
                  <td><MethodLabel method={p.method} />{p.reference ? ` — ${p.reference}` : ''}</td>
                  <td>
                    {f.money(p.amount, p.currency)}
                    {p.currency !== res.currency ? <span className="muted"> (سعر الصرف {f.rate(p.rateToBase)} {s.baseCurrency})</span> : null}
                  </td>
                  <td style={{ textAlign: 'end' }}>{f.money(p.appliedAmount, res.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {s.invoiceNote ? <p style={{ marginTop: 28, textAlign: 'center' }} className="muted">{s.invoiceNote}</p> : null}
      </article>

      {paying ? <PaymentForm reservationId={res.id} onClose={() => setPaying(false)} /> : null}
    </>
  );
}
