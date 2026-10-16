import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, BedDouble, LogIn, LogOut, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReservationStatusBadge, RoomStatusBadge } from '../components/badges';
import PaymentForm from '../components/PaymentForm';
import { Alert, Button, Card, ConfirmDialog, DataTable, EmptyState, PageHeader, StatCard, type Column } from '../components/ui';
import { useFmt, useToday } from '../hooks/useApp';
import { checkInReservation, checkOutReservation } from '../lib/actions';
import { ROOM_TYPE_LABELS } from '../lib/labels';
import { effectiveRoomStatus, guestById, reservationFinance, reservationLabel, roomById } from '../lib/logic';
import type { Reservation } from '../lib/types';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';

export default function Reception() {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const today = useToday();
  const [checkIn, setCheckIn] = useState<Reservation | null>(null);
  const [checkOut, setCheckOut] = useState<Reservation | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const { arrivals, departures, inHouse } = useMemo(
    () => ({
      // confirmed stays that should have started by today and not ended yet
      arrivals: data.reservations.filter((r) => r.status === 'confirmed' && r.checkIn <= today && r.checkOut > today),
      departures: data.reservations.filter((r) => r.status === 'checked_in' && r.checkOut <= today),
      inHouse: data.reservations.filter((r) => r.status === 'checked_in'),
    }),
    [data.reservations, today],
  );

  const doCheckIn = () => {
    if (!checkIn) return;
    const res = run((d) => checkInReservation(d, checkIn.id, today));
    if (res.ok) toast.success(`تم تسجيل وصول النزيل (${reservationLabel(checkIn)}).`);
    else toast.error(res.error ?? 'تعذّر تسجيل الوصول.');
    setCheckIn(null);
  };
  const doCheckOut = () => {
    if (!checkOut) return;
    const res = run((d) => checkOutReservation(d, checkOut.id));
    if (res.ok) toast.success(`تم تسجيل مغادرة النزيل (${reservationLabel(checkOut)}). الغرفة الآن قيد التنظيف.`);
    else toast.error(res.error ?? 'تعذّر تسجيل المغادرة.');
    setCheckOut(null);
  };

  const common = (extra: Column<Reservation>[]): Column<Reservation>[] => [
    { key: 'no', header: 'الحجز', render: (r) => <strong>{reservationLabel(r)}</strong>, sort: (r) => r.number },
    {
      key: 'guest',
      header: 'النزيل',
      render: (r) => {
        const g = guestById(data, r.guestId);
        return (
          <div>
            <div>{g?.fullName ?? '—'}</div>
            <div className="muted ltr" style={{ fontSize: 12.5 }}>{g?.phone}</div>
          </div>
        );
      },
      sort: (r) => guestById(data, r.guestId)?.fullName ?? '',
    },
    {
      key: 'room',
      header: 'الغرفة',
      render: (r) => {
        const room = roomById(data, r.roomId);
        return room ? (
          <div>
            <div>غرفة {room.number}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{ROOM_TYPE_LABELS[room.type]}</div>
          </div>
        ) : (
          '—'
        );
      },
      sort: (r) => roomById(data, r.roomId)?.number ?? '',
    },
    ...extra,
  ];

  const balanceCol: Column<Reservation> = {
    key: 'balance',
    header: 'المتبقي',
    render: (r) => {
      const fin = reservationFinance(r, data.payments, data.orders);
      return <span style={{ color: fin.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>{f.money(fin.balance, r.currency)}</span>;
    },
    sort: (r) => reservationFinance(r, data.payments, data.orders).balance,
  };

  const payBtn = (r: Reservation) =>
    reservationFinance(r, data.payments, data.orders).balance > 0 ? (
      <Button small onClick={() => setPaying(r.id)}>
        <Wallet size={15} /> دفعة
      </Button>
    ) : null;

  const arrivalCols = common([
    { key: 'in', header: 'الدخول', render: (r) => (r.checkIn < today ? <>{f.date(r.checkIn)} <span style={{ color: 'var(--danger)' }}>(متأخر)</span></> : f.date(r.checkIn)), sort: (r) => r.checkIn },
    { key: 'out', header: 'المغادرة', render: (r) => f.date(r.checkOut), sort: (r) => r.checkOut },
    {
      key: 'roomStatus',
      header: 'حالة الغرفة',
      render: (r) => {
        const room = roomById(data, r.roomId);
        return room ? <RoomStatusBadge status={effectiveRoomStatus(room, data.reservations, today)} /> : '—';
      },
    },
    balanceCol,
    {
      key: 'actions',
      header: '',
      actions: true,
      render: (r) => (
        <div className="row-actions" style={{ alignItems: 'center' }}>
          {payBtn(r)}
          <Button small variant="success" onClick={() => setCheckIn(r)}>
            <LogIn size={15} /> تسجيل الوصول
          </Button>
        </div>
      ),
    },
  ]);

  const departureCols = common([
    { key: 'out', header: 'المغادرة', render: (r) => (r.checkOut < today ? <>{f.date(r.checkOut)} <span style={{ color: 'var(--danger)' }}>(متأخر)</span></> : f.date(r.checkOut)), sort: (r) => r.checkOut },
    balanceCol,
    {
      key: 'actions',
      header: '',
      actions: true,
      render: (r) => (
        <div className="row-actions" style={{ alignItems: 'center' }}>
          {payBtn(r)}
          <Button small variant="primary" onClick={() => setCheckOut(r)}>
            <LogOut size={15} /> تسجيل المغادرة
          </Button>
        </div>
      ),
    },
  ]);

  const inHouseCols = common([
    { key: 'status', header: 'الحالة', render: (r) => <ReservationStatusBadge status={r.status} /> },
    { key: 'out', header: 'المغادرة', render: (r) => f.date(r.checkOut), sort: (r) => r.checkOut },
    balanceCol,
    {
      key: 'actions',
      header: '',
      actions: true,
      render: (r) => (
        <div className="row-actions" style={{ alignItems: 'center' }}>
          {payBtn(r)}
          <Link to={`/invoices/${r.id}`} className="btn btn-secondary btn-sm">
            الفاتورة
          </Link>
          <Button small variant="primary" onClick={() => setCheckOut(r)}>
            <LogOut size={15} /> تسجيل المغادرة
          </Button>
        </div>
      ),
    },
  ]);

  const outBalance = checkOut ? reservationFinance(checkOut, data.payments, data.orders) : undefined;
  const inRoom = checkIn ? roomById(data, checkIn.roomId) : undefined;

  return (
    <>
      <PageHeader title="الاستقبال" subtitle={`عمليات اليوم — ${f.date(today)}`} />
      <div className="grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={<ArrowDownToLine size={22} />} label="وصول مستحق" value={f.int(arrivals.length)} />
        <StatCard icon={<ArrowUpFromLine size={22} />} label="مغادرة مستحقة" value={f.int(departures.length)} tone="warning" />
        <StatCard icon={<BedDouble size={22} />} label="نزلاء داخل الفندق" value={f.int(inHouse.length)} tone="success" />
      </div>

      <div className="stack">
        <Card title="وصول اليوم" pad={false}>
          <DataTable
            columns={arrivalCols}
            rows={arrivals}
            rowKey={(r) => r.id}
            pageSize={50}
            empty={<EmptyState icon={<ArrowDownToLine size={26} />} title="لا توجد وصولات مستحقة اليوم" text="الحجوزات المؤكدة التي حان موعد دخولها تظهر هنا." />}
          />
        </Card>
        <Card title="مغادرة اليوم" pad={false}>
          <DataTable
            columns={departureCols}
            rows={departures}
            rowKey={(r) => r.id}
            pageSize={50}
            empty={<EmptyState icon={<ArrowUpFromLine size={26} />} title="لا توجد مغادرات مستحقة اليوم" text="النزلاء الذين حان موعد مغادرتهم يظهرون هنا." />}
          />
        </Card>
        <Card title="النزلاء داخل الفندق" pad={false}>
          <DataTable
            columns={inHouseCols}
            rows={inHouse}
            rowKey={(r) => r.id}
            pageSize={50}
            empty={<EmptyState icon={<BedDouble size={26} />} title="لا يوجد نزلاء داخل الفندق حاليًا" />}
          />
        </Card>
      </div>

      {checkIn ? (
        <ConfirmDialog
          title="تسجيل الوصول"
          confirmLabel="تسجيل الوصول"
          message={
            <>
              <p style={{ marginTop: 0 }}>
                تسجيل وصول <strong>{guestById(data, checkIn.guestId)?.fullName}</strong> إلى الغرفة <strong>{inRoom?.number}</strong> (حتى {f.date(checkIn.checkOut)}).
              </p>
              {inRoom && (inRoom.status === 'cleaning' || inRoom.status === 'maintenance') ? (
                <Alert tone="warning">الغرفة حاليًا «{inRoom.status === 'cleaning' ? 'قيد التنظيف' : 'تحت الصيانة'}». سيرفض النظام التسكين حتى تصبح متاحة.</Alert>
              ) : null}
            </>
          }
          onConfirm={doCheckIn}
          onCancel={() => setCheckIn(null)}
        />
      ) : null}
      {checkOut && outBalance ? (
        <ConfirmDialog
          title="تسجيل المغادرة"
          confirmLabel="تسجيل المغادرة"
          message={
            <>
              <p style={{ marginTop: 0 }}>
                تسجيل مغادرة <strong>{guestById(data, checkOut.guestId)?.fullName}</strong> من الغرفة <strong>{roomById(data, checkOut.roomId)?.number}</strong>. ستتحول الغرفة إلى «قيد التنظيف».
              </p>
              {outBalance.balance > 0 ? (
                <Alert tone="warning">يوجد مبلغ متبقٍ على الحجز: {f.money(outBalance.balance, checkOut.currency)}. يمكنك تسجيل دفعة أولًا أو المتابعة وتحصيله لاحقًا.</Alert>
              ) : null}
            </>
          }
          onConfirm={doCheckOut}
          onCancel={() => setCheckOut(null)}
        />
      ) : null}
      {paying ? <PaymentForm reservationId={paying} onClose={() => setPaying(null)} /> : null}
    </>
  );
}
