import { useMemo, useState } from 'react';
import { BarChart3, Download, Printer } from 'lucide-react';
import { ReservationStatusBadge } from '../components/badges';
import { Alert, Button, Card, DataTable, EmptyState, PageHeader, SelectField, StatCard, TextField, type Column } from '../components/ui';
import { useFmt, useToday } from '../hooks/useApp';
import { toCsv } from '../lib/csv';
import { addDays, firstDayOfMonth, lastDayOfMonth } from '../lib/dates';
import { downloadText } from '../lib/download';
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, RESERVATION_STATUS_LABELS, ROOM_TYPE_LABELS } from '../lib/labels';
import { guestById, reservationLabel, roomById, toBase } from '../lib/logic';
import { expensesReport, occupancyReport, reservationsReport, revenueReport, type OccupancyRow, type ReservationReportRow } from '../lib/reports';
import type { Expense, Payment, ReservationStatus } from '../lib/types';
import { roundCur } from '../lib/currencies';
import { useData } from '../store/DataContext';

type Tab = 'occupancy' | 'reservations' | 'revenue' | 'expenses';
const TAB_LABELS: Record<Tab, string> = {
  occupancy: 'الإشغال',
  reservations: 'الحجوزات',
  revenue: 'الإيرادات',
  expenses: 'المصروفات',
};

export default function Reports() {
  const { data } = useData();
  const f = useFmt();
  const today = useToday();
  const [tab, setTab] = useState<Tab>('occupancy');
  const [from, setFrom] = useState(() => firstDayOfMonth(today));
  const [to, setTo] = useState(() => lastDayOfMonth(today));
  const [status, setStatus] = useState('');

  const validRange = Boolean(from) && Boolean(to) && from <= to;
  const range = { from, to };
  const base = data.settings.baseCurrency;

  const occ = useMemo(() => (validRange ? occupancyReport(data, range) : null), [data, from, to, validRange]);
  const resRep = useMemo(() => (validRange ? reservationsReport(data, range, (status || undefined) as ReservationStatus | undefined) : null), [data, from, to, validRange, status]);
  const rev = useMemo(() => (validRange ? revenueReport(data, range) : null), [data, from, to, validRange]);
  const exp = useMemo(() => (validRange ? expensesReport(data, range) : null), [data, from, to, validRange]);

  const preset = (kind: 'month' | 'last30' | 'year' | 'all') => {
    if (kind === 'month') {
      setFrom(firstDayOfMonth(today));
      setTo(lastDayOfMonth(today));
    } else if (kind === 'last30') {
      setFrom(addDays(today, -29));
      setTo(today);
    } else if (kind === 'year') {
      setFrom(`${today.slice(0, 4)}-01-01`);
      setTo(`${today.slice(0, 4)}-12-31`);
    } else {
      const dates = [...data.reservations.map((r) => r.checkIn), ...data.payments.map((p) => p.date), ...data.expenses.map((x) => x.date)].sort();
      setFrom(dates[0] ?? firstDayOfMonth(today));
      const ends = [...data.reservations.map((r) => r.checkOut), today].sort();
      setTo(ends[ends.length - 1]);
    }
  };

  const fileName = (name: string) => `${name}_${from}_${to}.csv`;

  const exportCsv = () => {
    if (!validRange) return;
    if (tab === 'occupancy' && occ) {
      downloadText(
        fileName('occupancy'),
        toCsv(
          ['رقم الغرفة', 'النوع', 'الليالي المشغولة', 'عدد أيام الفترة', 'نسبة الإشغال %'],
          occ.rows.map((r) => [r.room.number, ROOM_TYPE_LABELS[r.room.type], r.occupiedNights, r.availableNights, r.ratePct]),
        ),
        'text/csv;charset=utf-8',
      );
    } else if (tab === 'reservations' && resRep) {
      downloadText(
        fileName('reservations'),
        toCsv(
          ['رقم الحجز', 'النزيل', 'الغرفة', 'الدخول', 'المغادرة', 'الليالي', 'العملة', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'],
          resRep.rows.map((x) => [
            reservationLabel(x.reservation),
            guestById(data, x.reservation.guestId)?.fullName ?? '',
            roomById(data, x.reservation.roomId)?.number ?? '',
            x.reservation.checkIn,
            x.reservation.checkOut,
            x.nights,
            x.reservation.currency,
            x.total,
            x.paid,
            x.balance,
            RESERVATION_STATUS_LABELS[x.reservation.status],
          ]),
        ),
        'text/csv;charset=utf-8',
      );
    } else if (tab === 'revenue' && rev) {
      downloadText(
        fileName('revenue'),
        toCsv(
          ['التاريخ', 'الحجز', 'النزيل', 'الطريقة', 'العملة', 'المبلغ', 'سعر الصرف', `بالعملة الأساسية (${base})`, 'المرجع'],
          rev.payments.map((p) => {
            const r = data.reservations.find((x) => x.id === p.reservationId);
            return [p.date, r ? reservationLabel(r) : '', r ? (guestById(data, r.guestId)?.fullName ?? '') : '', PAYMENT_METHOD_LABELS[p.method], p.currency, p.amount, p.rateToBase, toBase(p.amount, p.rateToBase, data.settings), p.reference];
          }),
        ),
        'text/csv;charset=utf-8',
      );
    } else if (tab === 'expenses' && exp) {
      downloadText(
        fileName('expenses'),
        toCsv(
          ['التاريخ', 'التصنيف', 'الوصف', 'العملة', 'المبلغ', 'سعر الصرف', `بالعملة الأساسية (${base})`],
          exp.expenses.map((x) => [x.date, EXPENSE_CATEGORY_LABELS[x.category], x.description, x.currency, x.amount, x.rateToBase, toBase(x.amount, x.rateToBase, data.settings)]),
        ),
        'text/csv;charset=utf-8',
      );
    }
  };

  const net = rev && exp ? roundCur(rev.totalBase - exp.totalBase, base) : 0;

  const occCols: Column<OccupancyRow>[] = [
    { key: 'room', header: 'الغرفة', render: (r) => <strong>{r.room.number}</strong>, sort: (r) => r.room.number },
    { key: 'type', header: 'النوع', render: (r) => ROOM_TYPE_LABELS[r.room.type] },
    { key: 'occ', header: 'الليالي المشغولة', render: (r) => f.int(r.occupiedNights), sort: (r) => r.occupiedNights },
    { key: 'days', header: 'أيام الفترة', render: (r) => f.int(r.availableNights) },
    {
      key: 'pct',
      header: 'نسبة الإشغال',
      render: (r) => (
        <div className="row" style={{ flexWrap: 'nowrap', minWidth: 140 }}>
          <div className="bar" style={{ flex: 1 }}>
            <span style={{ width: `${Math.min(100, r.ratePct)}%` }} />
          </div>
          <span className="num">{f.num(r.ratePct, 1)}%</span>
        </div>
      ),
      sort: (r) => r.ratePct,
    },
  ];

  const resCols: Column<ReservationReportRow>[] = [
    { key: 'no', header: 'الحجز', render: (x) => <strong>{reservationLabel(x.reservation)}</strong>, sort: (x) => x.reservation.number },
    { key: 'guest', header: 'النزيل', render: (x) => guestById(data, x.reservation.guestId)?.fullName ?? '—' },
    { key: 'room', header: 'الغرفة', render: (x) => roomById(data, x.reservation.roomId)?.number ?? '—' },
    { key: 'in', header: 'الدخول', render: (x) => f.date(x.reservation.checkIn), sort: (x) => x.reservation.checkIn },
    { key: 'out', header: 'المغادرة', render: (x) => f.date(x.reservation.checkOut), sort: (x) => x.reservation.checkOut },
    { key: 'nights', header: 'الليالي', render: (x) => f.int(x.nights), sort: (x) => x.nights },
    { key: 'total', header: 'الإجمالي', render: (x) => <span className="num">{f.money(x.total, x.reservation.currency)}</span>, sort: (x) => x.total },
    { key: 'balance', header: 'المتبقي', render: (x) => <span className="num">{f.money(x.balance, x.reservation.currency)}</span>, sort: (x) => x.balance },
    { key: 'status', header: 'الحالة', render: (x) => <ReservationStatusBadge status={x.reservation.status} /> },
  ];

  const payCols: Column<Payment>[] = [
    { key: 'date', header: 'التاريخ', render: (p) => f.date(p.date), sort: (p) => p.date },
    {
      key: 'res',
      header: 'الحجز',
      render: (p) => {
        const r = data.reservations.find((x) => x.id === p.reservationId);
        return r ? `${reservationLabel(r)} — ${guestById(data, r.guestId)?.fullName ?? ''}` : '—';
      },
    },
    { key: 'method', header: 'الطريقة', render: (p) => PAYMENT_METHOD_LABELS[p.method] },
    { key: 'amount', header: 'المبلغ', render: (p) => <span className="num">{f.money(p.amount, p.currency)}</span>, sort: (p) => p.amount },
    { key: 'base', header: 'بالعملة الأساسية', render: (p) => <span className="num">{f.base(toBase(p.amount, p.rateToBase, data.settings))}</span>, sort: (p) => toBase(p.amount, p.rateToBase, data.settings) },
  ];

  const expCols: Column<Expense>[] = [
    { key: 'date', header: 'التاريخ', render: (x) => f.date(x.date), sort: (x) => x.date },
    { key: 'cat', header: 'التصنيف', render: (x) => EXPENSE_CATEGORY_LABELS[x.category] },
    { key: 'desc', header: 'الوصف', render: (x) => x.description },
    { key: 'amount', header: 'المبلغ', render: (x) => <span className="num">{f.money(x.amount, x.currency)}</span>, sort: (x) => x.amount },
    { key: 'base', header: 'بالعملة الأساسية', render: (x) => <span className="num">{f.base(toBase(x.amount, x.rateToBase, data.settings))}</span>, sort: (x) => toBase(x.amount, x.rateToBase, data.settings) },
  ];

  const noData = <EmptyState icon={<BarChart3 size={26} />} title="لا توجد بيانات في هذه الفترة" text="غيّر الفترة الزمنية أو سجّل بيانات جديدة." />;

  return (
    <>
      <PageHeader
        title="التقارير"
        subtitle="تقارير مبنية على بياناتك المسجلة. المبالغ المجمّعة بالعملة الأساسية حسب أسعار الصرف المحفوظة وقت كل عملية."
        actions={
          <>
            <Button onClick={exportCsv} disabled={!validRange}>
              <Download size={17} /> تصدير CSV
            </Button>
            <Button variant="primary" onClick={() => window.print()} disabled={!validRange}>
              <Printer size={17} /> طباعة
            </Button>
          </>
        }
      />

      <div className="tabs no-print" role="tablist">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <Card pad={false} className="no-print">
        <div className="toolbar">
          <TextField label="من تاريخ" type="date" value={from} onChange={setFrom} />
          <TextField label="إلى تاريخ" type="date" value={to} min={from || undefined} onChange={setTo} />
          <div className="row" style={{ alignSelf: 'flex-end' }}>
            <Button small onClick={() => preset('month')}>هذا الشهر</Button>
            <Button small onClick={() => preset('last30')}>آخر 30 يومًا</Button>
            <Button small onClick={() => preset('year')}>هذه السنة</Button>
            <Button small onClick={() => preset('all')}>كل الفترات</Button>
          </div>
          {tab === 'reservations' ? (
            <SelectField
              label="حالة الحجز"
              value={status}
              onChange={setStatus}
              placeholder="الكل"
              options={(Object.keys(RESERVATION_STATUS_LABELS) as ReservationStatus[]).map((k) => ({ value: k, label: RESERVATION_STATUS_LABELS[k] }))}
            />
          ) : null}
        </div>
      </Card>

      {!validRange ? (
        <div style={{ marginTop: 16 }}>
          <Alert tone="danger">حدّد فترة صحيحة: تاريخ البداية يجب أن يسبق أو يساوي تاريخ النهاية.</Alert>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="print-only">
            <h2 style={{ margin: 0 }}>{data.settings.hotelName} — تقرير {TAB_LABELS[tab]}</h2>
            <p>الفترة: {f.date(from)} إلى {f.date(to)}</p>
          </div>

          <div className="grid-stats">
            <StatCard icon={<BarChart3 size={22} />} label="الإيرادات في الفترة" value={f.base(rev?.totalBase ?? 0)} tone="success" />
            <StatCard icon={<BarChart3 size={22} />} label="المصروفات في الفترة" value={f.base(exp?.totalBase ?? 0)} tone="danger" />
            <StatCard icon={<BarChart3 size={22} />} label="الصافي" value={f.base(net)} tone={net < 0 ? 'danger' : 'success'} />
            <StatCard icon={<BarChart3 size={22} />} label="نسبة الإشغال" value={`${f.num(occ?.overallPct ?? 0, 1)}%`} sub={`${f.int(occ?.totalOccupied ?? 0)} من ${f.int(occ?.totalAvailable ?? 0)} ليلة-غرفة`} />
          </div>

          {tab === 'occupancy' && occ ? (
            <Card title="تقرير الإشغال" pad={false}>
              <DataTable columns={occCols} rows={occ.rows} rowKey={(r) => r.room.id} pageSize={50} initialSort={{ key: 'room', dir: 'asc' }} empty={noData} />
            </Card>
          ) : null}

          {tab === 'reservations' && resRep ? (
            <>
              <Card title="الحجوزات حسب الحالة">
                <div className="row" style={{ gap: 24 }}>
                  {(Object.keys(RESERVATION_STATUS_LABELS) as ReservationStatus[]).map((k) => (
                    <div key={k}>
                      <div className="muted">{RESERVATION_STATUS_LABELS[k]}</div>
                      <div className="strong" style={{ fontSize: 20 }}>{f.int(resRep.byStatus[k])}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="تقرير الحجوزات" pad={false}>
                <DataTable columns={resCols} rows={resRep.rows} rowKey={(x) => x.reservation.id} pageSize={data.settings.pageSize} initialSort={{ key: 'in', dir: 'asc' }} empty={noData} />
              </Card>
            </>
          ) : null}

          {tab === 'revenue' && rev ? (
            <>
              <div className="grid-2">
                <Card title="حسب طريقة الدفع">
                  {rev.byMethod.length === 0 ? (
                    <span className="muted">لا توجد دفعات.</span>
                  ) : (
                    rev.byMethod.map((m) => (
                      <div className="legend-row" key={m.method}>
                        <span>{PAYMENT_METHOD_LABELS[m.method]} <span className="muted">({f.int(m.count)})</span></span>
                        <strong>{f.base(m.base)}</strong>
                      </div>
                    ))
                  )}
                </Card>
                <Card title="حسب العملة">
                  {rev.byCurrency.length === 0 ? (
                    <span className="muted">لا توجد دفعات.</span>
                  ) : (
                    rev.byCurrency.map((c) => (
                      <div className="legend-row" key={c.currency}>
                        <span>{f.money(c.amount, c.currency)}</span>
                        <strong>{f.base(c.base)}</strong>
                      </div>
                    ))
                  )}
                </Card>
              </div>
              <Card title="تقرير الإيرادات" pad={false}>
                <DataTable columns={payCols} rows={rev.payments} rowKey={(p) => p.id} pageSize={data.settings.pageSize} initialSort={{ key: 'date', dir: 'asc' }} empty={noData} />
              </Card>
            </>
          ) : null}

          {tab === 'expenses' && exp ? (
            <>
              <div className="grid-2">
                <Card title="حسب التصنيف">
                  {exp.byCategory.length === 0 ? (
                    <span className="muted">لا توجد مصروفات.</span>
                  ) : (
                    exp.byCategory.map((c) => (
                      <div className="legend-row" key={c.category}>
                        <span>{EXPENSE_CATEGORY_LABELS[c.category]} <span className="muted">({f.int(c.count)})</span></span>
                        <strong>{f.base(c.base)}</strong>
                      </div>
                    ))
                  )}
                </Card>
                <Card title="حسب العملة">
                  {exp.byCurrency.length === 0 ? (
                    <span className="muted">لا توجد مصروفات.</span>
                  ) : (
                    exp.byCurrency.map((c) => (
                      <div className="legend-row" key={c.currency}>
                        <span>{f.money(c.amount, c.currency)}</span>
                        <strong>{f.base(c.base)}</strong>
                      </div>
                    ))
                  )}
                </Card>
              </div>
              <Card title="تقرير المصروفات" pad={false}>
                <DataTable columns={expCols} rows={exp.expenses} rowKey={(x) => x.id} pageSize={data.settings.pageSize} initialSort={{ key: 'date', dir: 'asc' }} empty={noData} />
              </Card>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
