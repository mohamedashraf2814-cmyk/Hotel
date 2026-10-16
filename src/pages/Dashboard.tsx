import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  Flower2,
  Hourglass,
  Sparkles,
  Plus,
  AlertCircle,
  PiggyBank,
  Receipt,
  UtensilsCrossed,
  Wallet,
  Wrench,
} from 'lucide-react';
import { orderLabel } from '../lib/services';
import { orderTotals } from '../lib/logic';
import { ReservationStatusBadge } from '../components/badges';
import { Card, EmptyState, PageHeader, StatCard } from '../components/ui';
import { useFmt, useToday } from '../hooks/useApp';
import { effectiveRoomStatus, guestById, reservationLabel, roomById } from '../lib/logic';
import { ROOM_STATUS_LABELS } from '../lib/labels';
import { computeDashboard } from '../lib/stats';
import type { RoomStatus } from '../lib/types';
import { useData } from '../store/DataContext';

const STATUS_COLORS: Record<RoomStatus, string> = {
  available: '#16A34A',
  occupied: '#DC2626',
  reserved: '#2563EB',
  cleaning: '#F59E0B',
  maintenance: '#64748B',
};

const RING = 2 * Math.PI * 52;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'مساء الخير';
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'نهارك سعيد';
  return 'مساء الخير';
}

export default function Dashboard() {
  const { data } = useData();
  const f = useFmt();
  const today = useToday();
  const s = useMemo(() => computeDashboard(data, today), [data, today]);
  const rooms = useMemo(
    () =>
      [...data.rooms]
        .sort((a, b) => a.number.localeCompare(b.number, 'ar', { numeric: true }))
        .map((r) => ({ room: r, status: effectiveRoomStatus(r, data.reservations, today) })),
    [data.rooms, data.reservations, today],
  );

  const attention = useMemo(() => {
    const out: { text: string; to: string }[] = [];
    if (s.departuresToday.length) out.push({ text: `${f.int(s.departuresToday.length)} مغادرة بانتظار التسجيل`, to: '/reception' });
    if (s.arrivalsToday.length) out.push({ text: `${f.int(s.arrivalsToday.length)} وصول بانتظار التسجيل`, to: '/reception' });
    if (s.outstandingBase > 0) out.push({ text: `أرصدة مستحقة ${f.base(s.outstandingBase)}`, to: '/payments' });
    if (s.byStatus.cleaning) out.push({ text: `${f.int(s.byStatus.cleaning)} غرفة قيد التنظيف`, to: '/rooms' });
    if (s.restaurantOpen.length) out.push({ text: `${f.int(s.restaurantOpen.length)} طلب مطعم مفتوح`, to: '/restaurant' });
    return out;
  }, [s, f]);

  const isEmpty = data.rooms.length === 0 && data.reservations.length === 0;

  return (
    <>
      <PageHeader title="لوحة التحكم" subtitle={`نظرة عامة على ${data.settings.hotelName} — ${f.date(today)}`} />


      <section className="hero" aria-label="ملخص اليوم">
        <div className="hero-main">
          <div className="hero-hello">{greeting()}</div>
          <h2 className="hero-title">{data.settings.hotelName || 'Merak'}</h2>
          <p className="hero-sub">
            {s.arrivalsToday.length + s.departuresToday.length === 0
              ? 'لا توجد حركة وصول أو مغادرة اليوم.'
              : `${f.int(s.arrivalsToday.length)} وصول و${f.int(s.departuresToday.length)} مغادرة اليوم.`}
          </p>
          <div className="hero-actions">
            <Link to="/reservations?new=1" className="hero-btn primary">
              <Plus size={17} aria-hidden="true" /> حجز جديد
            </Link>
            <Link to="/reception" className="hero-btn">الاستقبال</Link>
            <Link to="/restaurant?new=1" className="hero-btn">طلب مطعم</Link>
            <Link to="/spa?new=1" className="hero-btn">موعد سبا</Link>
          </div>
        </div>
        <div className="hero-ring" role="img" aria-label={`نسبة الإشغال ${f.int(s.occupancyRate)}%`}>
          <svg viewBox="0 0 120 120" width="148" height="148">
            <circle cx="60" cy="60" r="52" className="ring-bg" />
            <circle
              cx="60"
              cy="60"
              r="52"
              className="ring-fg"
              style={{ ['--off' as string]: String(RING * (1 - Math.min(100, s.occupancyRate) / 100)), strokeDasharray: RING }}
            />
          </svg>
          <div className="ring-text">
            <strong>{f.int(s.occupancyRate)}%</strong>
            <span>إشغال</span>
          </div>
        </div>
      </section>

      {attention.length ? (
        <div className="attention" role="list" aria-label="يحتاج انتباهك">
          <span className="attention-title"><Sparkles size={16} aria-hidden="true" /> يحتاج انتباهك</span>
          {attention.map((a) => (
            <Link key={a.text} to={a.to} className="attn" role="listitem">
              <AlertCircle size={15} aria-hidden="true" /> {a.text}
            </Link>
          ))}
        </div>
      ) : null}

      {isEmpty ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <EmptyState
            icon={<BedDouble size={26} />}
            title="ابدأ بإعداد فندقك"
            text="النظام فارغ وجاهز لبياناتك. أضف الغرف أولًا، ثم النزلاء، ثم سجّل أول حجز. يمكنك ضبط العملات وأسعار الصرف من الإعدادات."
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link to="/rooms" className="btn btn-primary">
                  إضافة الغرف
                </Link>
                <Link to="/settings" className="btn btn-secondary">
                  الإعدادات والعملات
                </Link>
              </div>
            }
          />
        </div>
      ) : null}

      <div className="grid-stats">
        <StatCard index={0} icon={<BedDouble size={22} />} label="إجمالي الغرف" value={f.int(s.totalRooms)} />
        <StatCard index={1} icon={<DoorOpen size={22} />} label="غرف متاحة" value={f.int(s.byStatus.available)} tone="success" />
        <StatCard index={2} icon={<DoorClosed size={22} />} label="غرف مشغولة" value={f.int(s.byStatus.occupied)} tone="danger" sub={`نسبة الإشغال ${f.int(s.occupancyRate)}%`} />
        <StatCard index={3} icon={<CalendarCheck size={22} />} label="غرف محجوزة" value={f.int(s.byStatus.reserved)} />
        <StatCard index={4} icon={<ArrowDownToLine size={22} />} label="وصول اليوم" value={f.int(s.arrivalsToday.length)} sub="بانتظار تسجيل الوصول" />
        <StatCard index={5} icon={<ArrowUpFromLine size={22} />} label="مغادرة اليوم" value={f.int(s.departuresToday.length)} sub="بانتظار تسجيل المغادرة" tone="warning" />
        <StatCard index={6} icon={<Hourglass size={22} />} label="الحجوزات النشطة" value={f.int(s.activeReservations)} />
        <StatCard index={7} icon={<Wrench size={22} />} label="تنظيف / صيانة" value={f.int(s.byStatus.cleaning + s.byStatus.maintenance)} tone="warning" />
        <StatCard index={8} icon={<Wallet size={22} />} label="الإيرادات المسجلة" value={f.base(s.revenueBase)} tone="success" sub="بالعملة الأساسية" />
        <StatCard index={9} icon={<Receipt size={22} />} label="المصروفات المسجلة" value={f.base(s.expensesBase)} tone="danger" sub="بالعملة الأساسية" />
        <StatCard index={10} icon={<PiggyBank size={22} />} label="صافي الربح" value={f.base(s.netBase)} tone={s.netBase < 0 ? 'danger' : 'success'} />
        <StatCard index={11} icon={<CheckCircle2 size={22} />} label="أرصدة مستحقة" value={f.base(s.outstandingBase)} tone="warning" sub="المتبقي على الحجوزات" />
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <Card title="نظرة على إشغال الغرف">
          {data.rooms.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>لا توجد غرف بعد.</p>
          ) : (
            <>
              <div className="bar" style={{ display: 'flex' }} role="img" aria-label="توزيع حالات الغرف">
                {(Object.keys(STATUS_COLORS) as RoomStatus[]).map((k) =>
                  s.byStatus[k] ? (
                    <span key={k} style={{ width: `${(s.byStatus[k] / s.totalRooms) * 100}%`, background: STATUS_COLORS[k], borderRadius: 0 }} />
                  ) : null,
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                {(Object.keys(STATUS_COLORS) as RoomStatus[]).map((k) => (
                  <div className="legend-row" key={k}>
                    <span>
                      <span className="dot" style={{ background: STATUS_COLORS[k] }} />
                      {ROOM_STATUS_LABELS[k]}
                    </span>
                    <strong>{f.int(s.byStatus[k])}</strong>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                {rooms.map(({ room, status }) => (
                  <span key={room.id} className={`room-chip ${status}`} title={`غرفة ${room.number}: ${ROOM_STATUS_LABELS[status]}`}>
                    {room.number}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title="أحدث الحجوزات" actions={<Link to="/reservations" className="btn btn-ghost btn-sm">عرض الكل</Link>} pad={false}>
          {s.recentReservations.length === 0 ? (
            <EmptyState title="لا توجد حجوزات" text="ستظهر هنا آخر الحجوزات التي تسجلها." />
          ) : (
            <div className="table-wrap">
              <table className="table rtable">
                <thead>
                  <tr>
                    <th>الحجز</th>
                    <th>النزيل</th>
                    <th>الغرفة</th>
                    <th>الوصول</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recentReservations.map((r) => (
                    <tr key={r.id}>
                      <td data-label="الحجز">{reservationLabel(r)}</td>
                      <td data-label="النزيل">{guestById(data, r.guestId)?.fullName ?? '—'}</td>
                      <td data-label="الغرفة">{roomById(data, r.roomId)?.number ?? '—'}</td>
                      <td data-label="الوصول">{f.date(r.checkIn)}</td>
                      <td data-label="الحالة">
                        <ReservationStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
          <Card title="السبا اليوم" actions={<Link to="/spa" className="btn btn-ghost btn-sm">فتح السبا</Link>}>
            <div className="mini-stats">
              <Flower2 size={18} aria-hidden="true" />
              <span>{f.int(s.spaToday.length)} موعد</span>
              <span className="muted">مبيعات اليوم {f.base(s.spaSalesToday)}</span>
            </div>
            {s.spaToday.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>لا توجد مواعيد اليوم.</p>
            ) : (
              s.spaToday.map((o) => (
                <div className="legend-row" key={o.id}>
                  <span>
                    <strong className="ltr">{o.time}</strong> — {o.lines.map((l) => l.name).join('، ')}
                    <span className="muted"> · {o.billing === 'room' ? (guestById(data, data.reservations.find((r) => r.id === o.reservationId)?.guestId ?? '')?.fullName ?? '') : o.customerName}</span>
                  </span>
                  <span className="muted">{o.status === 'completed' ? 'تمت' : o.place || orderLabel(o)}</span>
                </div>
              ))
            )}
          </Card>
          <Card title="المطعم الآن" actions={<Link to="/restaurant" className="btn btn-ghost btn-sm">فتح المطعم</Link>}>
            <div className="mini-stats">
              <UtensilsCrossed size={18} aria-hidden="true" />
              <span>{f.int(s.restaurantOpen.length)} طلب قيد التحضير</span>
              <span className="muted">مبيعات اليوم {f.base(s.restaurantSalesToday)}</span>
            </div>
            {s.restaurantOpen.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>لا توجد طلبات مفتوحة.</p>
            ) : (
              s.restaurantOpen.slice(0, 8).map((o) => (
                <div className="legend-row" key={o.id}>
                  <span>
                    <strong>{orderLabel(o)}</strong> — {o.place || (o.billing === 'room' ? `غرفة ${roomById(data, data.reservations.find((r) => r.id === o.reservationId)?.roomId ?? '')?.number ?? ''}` : o.customerName)}
                  </span>
                  <span className="num">{f.money(orderTotals(o).total, o.currency)}</span>
                </div>
              ))
            )}
          </Card>
      </div>

      {s.revenueByCurrency.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <Card title="المقبوضات حسب العملة">
            <div className="row" style={{ gap: 24 }}>
              {s.revenueByCurrency.map((x) => (
                <div key={x.currency}>
                  <div className="muted">{x.currency}</div>
                  <div className="strong" style={{ fontSize: 18 }}>{f.money(x.amount, x.currency)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
