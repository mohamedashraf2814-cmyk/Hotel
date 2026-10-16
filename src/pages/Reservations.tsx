import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Ban, CalendarCheck, Eye, Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { MethodLabel, ReservationStatusBadge } from '../components/badges';
import PaymentForm from '../components/PaymentForm';
import ReservationForm from '../components/ReservationForm';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  IconButton,
  Modal,
  PageHeader,
  SearchBox,
  SelectField,
  TextField,
  type Column,
} from '../components/ui';
import { useFmt } from '../hooks/useApp';
import { cancelReservation, deleteReservation } from '../lib/actions';
import { RESERVATION_STATUS_LABELS } from '../lib/labels';
import { guestById, reservationFinance, reservationLabel, roomById, type ReservationFinance } from '../lib/logic';
import type { Reservation, ReservationStatus } from '../lib/types';
import { includesText } from '../lib/ui-helpers';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';

function ReservationView({ reservation, onClose, onPay }: { reservation: Reservation; onClose: () => void; onPay: () => void }) {
  const { data } = useData();
  const f = useFmt();
  const guest = guestById(data, reservation.guestId);
  const room = roomById(data, reservation.roomId);
  const fin = reservationFinance(reservation, data.payments);
  const pays = data.payments.filter((p) => p.reservationId === reservation.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <Modal
      title={`حجز ${reservationLabel(reservation)}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Link to={`/invoices/${reservation.id}`} className="btn btn-secondary">
            <Receipt size={17} /> الفاتورة
          </Link>
          {reservation.status !== 'cancelled' && fin.balance > 0 ? (
            <Button variant="primary" onClick={onPay}>
              <Wallet size={17} /> تسجيل دفعة
            </Button>
          ) : null}
          <Button onClick={onClose}>إغلاق</Button>
        </>
      }
    >
      <dl className="kv">
        <div><dt>الحالة</dt><dd><ReservationStatusBadge status={reservation.status} /></dd></div>
        <div><dt>النزيل</dt><dd>{guest?.fullName ?? '—'}</dd></div>
        <div><dt>الغرفة</dt><dd>{room ? `غرفة ${room.number}` : '—'}</dd></div>
        <div><dt>عدد النزلاء</dt><dd>{f.int(reservation.guestsCount)}</dd></div>
        <div><dt>تاريخ الدخول</dt><dd>{f.date(reservation.checkIn)}</dd></div>
        <div><dt>تاريخ المغادرة</dt><dd>{f.date(reservation.checkOut)}</dd></div>
        <div><dt>ملاحظات</dt><dd>{reservation.notes || '—'}</dd></div>
        <div><dt>عملة الحجز</dt><dd>{reservation.currency}</dd></div>
      </dl>
      <div className="card" style={{ padding: 14, marginTop: 18, background: '#F8FAFC' }}>
        <dl className="kv kv-4">
          <div><dt>سعر الليلة × {f.int(fin.nights)}</dt><dd>{f.money(fin.subtotal, reservation.currency)}</dd></div>
          <div><dt>الخصم</dt><dd>{f.money(fin.discount, reservation.currency)}</dd></div>
          <div><dt>الإجمالي</dt><dd>{f.money(fin.total, reservation.currency)}</dd></div>
          <div><dt>المتبقي</dt><dd style={{ color: fin.balance > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>{f.money(fin.balance, reservation.currency)}</dd></div>
        </dl>
      </div>
      <h3 className="card-title" style={{ margin: '20px 0 8px' }}>سجل الدفعات</h3>
      {pays.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>لا توجد دفعات مسجلة.</p>
      ) : (
        <div className="table-wrap">
          <table className="table rtable">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الطريقة</th>
                <th>المبلغ المدفوع</th>
                <th>المحتسب على الحجز</th>
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td data-label="التاريخ">{f.date(p.date)}</td>
                  <td data-label="الطريقة"><MethodLabel method={p.method} /></td>
                  <td data-label="المبلغ المدفوع">{f.money(p.amount, p.currency)}</td>
                  <td data-label="المحتسب على الحجز">{f.money(p.appliedAmount, reservation.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

interface Row {
  r: Reservation;
  guestName: string;
  roomNo: string;
  fin: ReservationFinance;
}

export default function Reservations() {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [roomId, setRoomId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editing, setEditing] = useState<Reservation | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [deleting, setDeleting] = useState<Reservation | null>(null);

  const rows: Row[] = useMemo(
    () =>
      data.reservations
        .map((r) => ({
          r,
          guestName: guestById(data, r.guestId)?.fullName ?? '—',
          roomNo: roomById(data, r.roomId)?.number ?? '—',
          fin: reservationFinance(r, data.payments),
        }))
        .filter((x) => {
          if (status && x.r.status !== status) return false;
          if (roomId && x.r.roomId !== roomId) return false;
          if (from && x.r.checkOut <= from) return false;
          if (to && x.r.checkIn > to) return false;
          if (q.trim()) {
            const g = guestById(data, x.r.guestId);
            const hay = `${x.guestName} ${g?.phone ?? ''} ${x.roomNo} ${reservationLabel(x.r)} ${x.r.number}`;
            if (!includesText(hay, q)) return false;
          }
          return true;
        }),
    [data, q, status, roomId, from, to],
  );

  const doCancel = () => {
    if (!cancelling) return;
    const res = run((d) => cancelReservation(d, cancelling.id));
    if (res.ok) toast.success('تم إلغاء الحجز.');
    else toast.error(res.error ?? 'تعذّر الإلغاء.');
    setCancelling(null);
  };
  const doDelete = () => {
    if (!deleting) return;
    const res = run((d) => deleteReservation(d, deleting.id));
    if (res.ok) toast.success('تم حذف الحجز.');
    else toast.error(res.error ?? 'تعذّر الحذف.');
    setDeleting(null);
  };

  const columns: Column<Row>[] = [
    { key: 'no', header: 'الحجز', render: ({ r }) => <strong>{reservationLabel(r)}</strong>, sort: ({ r }) => r.number },
    { key: 'guest', header: 'النزيل', render: (x) => x.guestName, sort: (x) => x.guestName },
    { key: 'room', header: 'الغرفة', render: (x) => x.roomNo, sort: (x) => x.roomNo },
    { key: 'in', header: 'الدخول', render: ({ r }) => f.date(r.checkIn), sort: ({ r }) => r.checkIn },
    { key: 'out', header: 'المغادرة', render: ({ r }) => f.date(r.checkOut), sort: ({ r }) => r.checkOut },
    { key: 'nights', header: 'الليالي', render: ({ fin }) => f.int(fin.nights), sort: ({ fin }) => fin.nights },
    { key: 'total', header: 'الإجمالي', render: ({ r, fin }) => <span className="num">{f.money(fin.total, r.currency)}</span>, sort: ({ fin }) => fin.total },
    { key: 'paid', header: 'المدفوع', render: ({ r, fin }) => <span className="num">{f.money(fin.paid, r.currency)}</span>, sort: ({ fin }) => fin.paid },
    {
      key: 'balance',
      header: 'المتبقي',
      render: ({ r, fin }) => (
        <span className="num" style={{ color: r.status !== 'cancelled' && fin.balance > 0 ? 'var(--danger)' : undefined }}>
          {f.money(fin.balance, r.currency)}
        </span>
      ),
      sort: ({ fin }) => fin.balance,
    },
    { key: 'status', header: 'الحالة', render: ({ r }) => <ReservationStatusBadge status={r.status} />, sort: ({ r }) => RESERVATION_STATUS_LABELS[r.status] },
    {
      key: 'actions',
      header: '',
      actions: true,
      render: ({ r, fin }) => (
        <div className="row-actions">
          <IconButton label="عرض" onClick={() => setViewing(r.id)}>
            <Eye size={17} />
          </IconButton>
          {r.status === 'confirmed' || r.status === 'checked_in' ? (
            <IconButton label="تعديل" onClick={() => setEditing(r)}>
              <Pencil size={17} />
            </IconButton>
          ) : null}
          {r.status !== 'cancelled' && fin.balance > 0 ? (
            <IconButton label="تسجيل دفعة" onClick={() => setPaying(r.id)}>
              <Wallet size={17} />
            </IconButton>
          ) : null}
          <Link to={`/invoices/${r.id}`} className="icon-btn" aria-label="الفاتورة" title="الفاتورة">
            <Receipt size={17} />
          </Link>
          {r.status === 'confirmed' ? (
            <IconButton label="إلغاء الحجز" onClick={() => setCancelling(r)}>
              <Ban size={17} />
            </IconButton>
          ) : null}
          <IconButton label="حذف" danger onClick={() => setDeleting(r)}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      ),
    },
  ];

  const viewingRes = viewing ? data.reservations.find((r) => r.id === viewing) : undefined;

  return (
    <>
      <PageHeader
        title="الحجوزات"
        subtitle="إنشاء الحجوزات ومتابعة حالتها ومدفوعاتها. المبالغ معروضة بعملة كل حجز."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> حجز جديد
          </Button>
        }
      />
      <Card pad={false}>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="اسم النزيل أو الهاتف أو رقم الغرفة أو رقم الحجز…" />
          <SelectField
            label="الحالة"
            value={status}
            onChange={(v) => {
              setStatus(v);
              if (params.has('status')) setParams({}, { replace: true });
            }}
            placeholder="كل الحالات"
            options={(Object.keys(RESERVATION_STATUS_LABELS) as ReservationStatus[]).map((k) => ({ value: k, label: RESERVATION_STATUS_LABELS[k] }))}
          />
          <SelectField
            label="الغرفة"
            value={roomId}
            onChange={setRoomId}
            placeholder="كل الغرف"
            options={[...data.rooms].sort((a, b) => a.number.localeCompare(b.number, 'ar', { numeric: true })).map((r) => ({ value: r.id, label: r.number }))}
          />
          <TextField label="من تاريخ" type="date" value={from} onChange={setFrom} />
          <TextField label="إلى تاريخ" type="date" value={to} min={from || undefined} onChange={setTo} />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={({ r }) => r.id}
          pageSize={data.settings.pageSize}
          initialSort={{ key: 'no', dir: 'desc' }}
          empty={
            data.reservations.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck size={26} />}
                title="لا توجد حجوزات بعد"
                text={data.rooms.length === 0 ? 'أضف غرفًا ونزلاء أولًا ثم أنشئ أول حجز.' : 'أنشئ أول حجز لتبدأ.'}
                action={
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    <Plus size={18} /> حجز جديد
                  </Button>
                }
              />
            ) : (
              <EmptyState title="لا توجد نتائج" text="جرّب تغيير البحث أو عوامل التصفية." />
            )
          }
        />
      </Card>

      {editing ? <ReservationForm reservation={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {viewingRes ? (
        <ReservationView
          reservation={viewingRes}
          onClose={() => setViewing(null)}
          onPay={() => {
            setPaying(viewingRes.id);
            setViewing(null);
          }}
        />
      ) : null}
      {paying ? <PaymentForm reservationId={paying} onClose={() => setPaying(null)} /> : null}
      {cancelling ? (
        <ConfirmDialog
          danger
          title="إلغاء الحجز"
          confirmLabel="إلغاء الحجز"
          message={
            <>
              هل تريد إلغاء الحجز <strong>{reservationLabel(cancelling)}</strong>؟ ستصبح الغرفة متاحة لهذه الفترة، وستبقى الدفعات المسجلة محفوظة في السجل.
            </>
          }
          onConfirm={doCancel}
          onCancel={() => setCancelling(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          danger
          title="حذف الحجز"
          confirmLabel="حذف"
          message={
            <>
              هل تريد حذف الحجز <strong>{reservationLabel(deleting)}</strong> نهائيًا؟ لا يمكن حذف حجز عليه دفعات أو حجز منتهٍ؛ يمكن إلغاؤه بدلًا من ذلك.
            </>
          }
          onConfirm={doDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}
