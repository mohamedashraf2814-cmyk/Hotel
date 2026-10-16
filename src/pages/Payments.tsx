import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { MethodLabel, ReservationStatusBadge } from '../components/badges';
import PaymentForm from '../components/PaymentForm';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  SearchBox,
  SelectField,
  StatCard,
  TextField,
  type Column,
} from '../components/ui';
import { useFmt } from '../hooks/useApp';
import { PAYMENT_METHODS, deletePayment } from '../lib/actions';
import { roundCur } from '../lib/currencies';
import { PAYMENT_METHOD_LABELS } from '../lib/labels';
import { guestById, reservationFinance, reservationLabel, roomById, toBase, type ReservationFinance } from '../lib/logic';
import type { Payment, PaymentMethod, Reservation } from '../lib/types';
import { currencyOptions, includesText } from '../lib/ui-helpers';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';

interface PayRow {
  p: Payment;
  res?: Reservation;
  guestName: string;
  base: number;
}
interface InvRow {
  r: Reservation;
  guestName: string;
  roomNo: string;
  fin: ReservationFinance;
}

export default function Payments() {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const [tab, setTab] = useState<'payments' | 'invoices'>('payments');
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [currency, setCurrency] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyDue, setOnlyDue] = useState('');
  const [editing, setEditing] = useState<Payment | 'new' | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);

  const payRows: PayRow[] = useMemo(
    () =>
      data.payments
        .map((p) => {
          const res = data.reservations.find((r) => r.id === p.reservationId);
          return { p, res, guestName: res ? (guestById(data, res.guestId)?.fullName ?? '—') : '—', base: toBase(p.amount, p.rateToBase, data.settings) };
        })
        .filter(({ p, res, guestName }) => {
          if (method && p.method !== method) return false;
          if (currency && p.currency !== currency) return false;
          if (from && p.date < from) return false;
          if (to && p.date > to) return false;
          if (q.trim() && !includesText(`${guestName} ${p.reference} ${res ? reservationLabel(res) : ''} ${p.notes}`, q)) return false;
          return true;
        }),
    [data, q, method, currency, from, to],
  );
  const totalBase = roundCur(payRows.reduce((s, x) => s + x.base, 0), data.settings.baseCurrency);

  const invRows: InvRow[] = useMemo(
    () =>
      data.reservations
        .filter((r) => r.status !== 'cancelled')
        .map((r) => ({
          r,
          guestName: guestById(data, r.guestId)?.fullName ?? '—',
          roomNo: roomById(data, r.roomId)?.number ?? '—',
          fin: reservationFinance(r, data.payments, data.orders),
        }))
        .filter((x) => (onlyDue === 'due' ? x.fin.balance > 0 : onlyDue === 'paid' ? x.fin.balance <= 0 : true))
        .filter((x) => !q.trim() || includesText(`${x.guestName} ${x.roomNo} ${reservationLabel(x.r)}`, q)),
    [data, q, onlyDue],
  );

  const confirmDelete = () => {
    if (!deleting) return;
    const res = run((d) => deletePayment(d, deleting.id));
    if (res.ok) toast.success('تم حذف الدفعة وتحديث رصيد الحجز.');
    else toast.error(res.error ?? 'تعذّر الحذف.');
    setDeleting(null);
  };

  const payCols: Column<PayRow>[] = [
    { key: 'date', header: 'التاريخ', render: ({ p }) => f.date(p.date), sort: ({ p }) => p.date },
    { key: 'res', header: 'الحجز', render: ({ res }) => (res ? reservationLabel(res) : '—'), sort: ({ res }) => res?.number ?? 0 },
    { key: 'guest', header: 'النزيل', render: (x) => x.guestName, sort: (x) => x.guestName },
    { key: 'method', header: 'الطريقة', render: ({ p }) => <MethodLabel method={p.method} />, sort: ({ p }) => PAYMENT_METHOD_LABELS[p.method] },
    { key: 'amount', header: 'المبلغ المدفوع', render: ({ p }) => <strong className="num">{f.money(p.amount, p.currency)}</strong>, sort: ({ p }) => p.amount },
    {
      key: 'applied',
      header: 'المحتسب على الحجز',
      render: ({ p, res }) => (res ? <span className="num">{f.money(p.appliedAmount, res.currency)}</span> : '—'),
    },
    {
      key: 'base',
      header: `بالعملة الأساسية`,
      render: ({ base }) => <span className="num">{f.base(base)}</span>,
      sort: ({ base }) => base,
    },
    {
      key: 'actions',
      header: '',
      actions: true,
      render: ({ p, res }) => (
        <div className="row-actions">
          {res ? (
            <Link to={`/invoices/${res.id}`} className="icon-btn" aria-label="الفاتورة" title="الفاتورة">
              <Receipt size={17} />
            </Link>
          ) : null}
          <IconButton label="تعديل" onClick={() => setEditing(p)}>
            <Pencil size={17} />
          </IconButton>
          <IconButton label="حذف" danger onClick={() => setDeleting(p)}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      ),
    },
  ];

  const invCols: Column<InvRow>[] = [
    { key: 'no', header: 'الحجز', render: ({ r }) => <strong>{reservationLabel(r)}</strong>, sort: ({ r }) => r.number },
    { key: 'guest', header: 'النزيل', render: (x) => x.guestName, sort: (x) => x.guestName },
    { key: 'room', header: 'الغرفة', render: (x) => x.roomNo, sort: (x) => x.roomNo },
    { key: 'status', header: 'الحالة', render: ({ r }) => <ReservationStatusBadge status={r.status} /> },
    { key: 'total', header: 'الإجمالي', render: ({ r, fin }) => <span className="num">{f.money(fin.total, r.currency)}</span>, sort: ({ fin }) => fin.total },
    { key: 'paid', header: 'المدفوع', render: ({ r, fin }) => <span className="num">{f.money(fin.paid, r.currency)}</span>, sort: ({ fin }) => fin.paid },
    {
      key: 'balance',
      header: 'المتبقي',
      render: ({ r, fin }) => <span className="num" style={{ color: fin.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>{f.money(fin.balance, r.currency)}</span>,
      sort: ({ fin }) => fin.balance,
    },
    {
      key: 'actions',
      header: '',
      actions: true,
      render: ({ r, fin }) => (
        <div className="row-actions" style={{ alignItems: 'center' }}>
          {fin.balance > 0 ? (
            <Button small onClick={() => setPayFor(r.id)}>
              <Wallet size={15} /> دفعة
            </Button>
          ) : null}
          <Link to={`/invoices/${r.id}`} className="btn btn-secondary btn-sm">
            <Receipt size={15} /> الفاتورة
          </Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المدفوعات والفواتير"
        subtitle="تسجيل الدفعات بأي عملة مفعّلة، ومتابعة الأرصدة المتبقية وطباعة الفواتير"
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> تسجيل دفعة
          </Button>
        }
      />
      <div className="tabs no-print" role="tablist">
        <button role="tab" aria-selected={tab === 'payments'} className={`tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>
          سجل الدفعات
        </button>
        <button role="tab" aria-selected={tab === 'invoices'} className={`tab ${tab === 'invoices' ? 'active' : ''}`} onClick={() => setTab('invoices')}>
          الفواتير والأرصدة
        </button>
      </div>

      {tab === 'payments' ? (
        <>
          <div className="grid-stats" style={{ marginBottom: 16 }}>
            <StatCard icon={<Wallet size={22} />} label="إجمالي المقبوضات (حسب التصفية)" value={f.base(totalBase)} tone="success" sub="بالعملة الأساسية" />
            <StatCard icon={<CreditCard size={22} />} label="عدد الدفعات" value={f.int(payRows.length)} />
          </div>
          <Card pad={false}>
            <div className="toolbar">
              <SearchBox value={q} onChange={setQ} placeholder="اسم النزيل أو رقم الحجز أو المرجع…" />
              <SelectField label="الطريقة" value={method} onChange={setMethod} placeholder="الكل" options={PAYMENT_METHODS.map((m: PaymentMethod) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
              <SelectField label="العملة" value={currency} onChange={setCurrency} placeholder="الكل" options={currencyOptions(data.settings)} />
              <TextField label="من تاريخ" type="date" value={from} onChange={setFrom} />
              <TextField label="إلى تاريخ" type="date" value={to} min={from || undefined} onChange={setTo} />
            </div>
            <DataTable
              columns={payCols}
              rows={payRows}
              rowKey={({ p }) => p.id}
              pageSize={data.settings.pageSize}
              initialSort={{ key: 'date', dir: 'desc' }}
              empty={
                data.payments.length === 0 ? (
                  <EmptyState
                    icon={<CreditCard size={26} />}
                    title="لا توجد دفعات مسجلة"
                    text="سجّل دفعات الحجوزات هنا، ويمكنك استلام الدفعة بعملة مختلفة عن عملة الحجز."
                    action={
                      <Button variant="primary" onClick={() => setEditing('new')}>
                        <Plus size={18} /> تسجيل دفعة
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState title="لا توجد نتائج" text="جرّب تغيير البحث أو عوامل التصفية." />
                )
              }
            />
          </Card>
        </>
      ) : (
        <Card pad={false}>
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} placeholder="اسم النزيل أو رقم الغرفة أو رقم الحجز…" />
            <SelectField
              label="الرصيد"
              value={onlyDue}
              onChange={setOnlyDue}
              placeholder="الكل"
              options={[
                { value: 'due', label: 'عليها متبقٍ' },
                { value: 'paid', label: 'مسددة بالكامل' },
              ]}
            />
          </div>
          <DataTable
            columns={invCols}
            rows={invRows}
            rowKey={({ r }) => r.id}
            pageSize={data.settings.pageSize}
            initialSort={{ key: 'no', dir: 'desc' }}
            empty={<EmptyState icon={<Receipt size={26} />} title="لا توجد فواتير" text="تُنشأ الفاتورة تلقائيًا لكل حجز غير ملغي." />}
          />
        </Card>
      )}

      {editing ? <PaymentForm payment={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {payFor ? <PaymentForm reservationId={payFor} onClose={() => setPayFor(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          danger
          title="حذف دفعة"
          confirmLabel="حذف الدفعة"
          message={
            <>
              <p style={{ marginTop: 0 }}>
                سيتم حذف دفعة بقيمة <strong>{f.money(deleting.amount, deleting.currency)}</strong> بتاريخ {f.date(deleting.date)}.
              </p>
              <Alert tone="warning">الدفعات سجل مالي. الحذف يرفع الرصيد المتبقي على الحجز ويخفض الإيرادات المسجلة، ولا يمكن التراجع عنه.</Alert>
            </>
          }
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}
