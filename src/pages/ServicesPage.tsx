import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CheckCheck, Clock, Flower2, Pencil, Plus, Power, Receipt, Trash2, UtensilsCrossed, Wallet } from 'lucide-react';
import OrderForm from '../components/OrderForm';
import {
  Alert,
  Badge,
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
  StatCard,
  TextAreaField,
  TextField,
  type Column,
} from '../components/ui';
import { useFmt, useToday } from '../hooks/useApp';
import { PAYMENT_METHODS } from '../lib/actions';
import { roundCur } from '../lib/currencies';
import { CATEGORY_SUGGESTIONS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../lib/labels';
import { getRate, guestById, orderTotals, reservationLabel, roomById } from '../lib/logic';
import {
  addServiceItem,
  cancelOrder,
  completeOrder,
  deleteOrder,
  deleteServiceItem,
  orderLabel,
  orderSalesBase,
  setServiceItemActive,
  updateServiceItem,
  type ServiceItemInput,
} from '../lib/services';
import type { Department, FieldErrors, OrderStatus, PaymentMethod, ServiceItem, ServiceOrder } from '../lib/types';
import { currencyOptions, includesText, numStr, toNum } from '../lib/ui-helpers';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';

const TEXT = {
  spa: {
    title: 'السبا',
    subtitle: 'مواعيد الجلسات وقائمة خدمات السبا. احجز للنزيل على حساب غرفته أو لعميل خارجي يدفع مباشرة.',
    newOrder: 'حجز موعد',
    ordersTab: 'المواعيد',
    catalogTab: 'قائمة الخدمات',
    itemWord: 'خدمة',
    addItem: 'إضافة خدمة',
    place: 'المعالج',
    emptyOrders: 'لا توجد مواعيد',
    emptyCatalog: 'لا توجد خدمات بعد',
    emptyCatalogText: 'أضف خدمات السبا (مساج، حمام مغربي، عناية بالبشرة…) بأسعارها ومدتها.',
  },
  restaurant: {
    title: 'المطعم',
    subtitle: 'طلبات المطعم وخدمة الغرف وقائمة الطعام. حمّل الطلب على حساب غرفة النزيل أو سجّله لزائر يدفع مباشرة.',
    newOrder: 'طلب جديد',
    ordersTab: 'الطلبات',
    catalogTab: 'قائمة الطعام',
    itemWord: 'صنف',
    addItem: 'إضافة صنف',
    place: 'الطاولة',
    emptyOrders: 'لا توجد طلبات',
    emptyCatalog: 'قائمة الطعام فارغة',
    emptyCatalogText: 'أضف أصناف المطعم (إفطار، أطباق رئيسية، مشروبات…) بأسعارها.',
  },
} as const;

const STATUS_TONE: Record<OrderStatus, 'info' | 'success' | 'danger'> = { open: 'info', completed: 'success', cancelled: 'danger' };

// ---------------------------------------------------------------------------

function ItemForm({ department, item, onClose }: { department: Department; item?: ServiceItem; onClose: () => void }) {
  const { data, run } = useData();
  const toast = useToast();
  const s = data.settings;
  const spa = department === 'spa';
  const [v, setV] = useState({
    name: item?.name ?? '',
    category: item?.category ?? '',
    price: item ? numStr(item.price) : '',
    currency: item?.currency ?? s.baseCurrency,
    durationMin: item ? String(item.durationMin) : '60',
    description: item?.description ?? '',
    active: item?.active ?? true,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const listId = `cat-${department}`;
  const cats = [...new Set([...CATEGORY_SUGGESTIONS[department], ...data.serviceItems.filter((x) => x.department === department).map((x) => x.category)])];

  const submit = () => {
    const input: ServiceItemInput = {
      department,
      name: v.name,
      category: v.category,
      price: toNum(v.price),
      currency: v.currency,
      durationMin: spa ? toNum(v.durationMin) : 0,
      description: v.description,
      active: v.active,
    };
    const res = run((d) => (item ? updateServiceItem(d, item.id, input) : addServiceItem(d, input)));
    if (res.ok) {
      toast.success(item ? 'تم حفظ التعديلات.' : spa ? 'تمت إضافة الخدمة.' : 'تمت إضافة الصنف.');
      onClose();
    } else if (res.errors) setErrors(res.errors);
    else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  return (
    <Modal
      title={item ? `تعديل ${item.name}` : TEXT[department].addItem}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit}>
            {item ? 'حفظ التعديلات' : TEXT[department].addItem}
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
        <TextField label={spa ? 'اسم الخدمة' : 'اسم الصنف'} required value={v.name} onChange={set('name')} error={errors.name} className="span-2" maxLength={80} />
        <TextField label="التصنيف" required value={v.category} onChange={set('category')} error={errors.category} list={listId} hint="اختر من المقترحات أو اكتب تصنيفًا جديدًا." maxLength={40} />
        <datalist id={listId}>
          {cats.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {spa ? (
          <TextField label="المدة (دقيقة)" required type="number" inputMode="numeric" min={5} step={5} value={v.durationMin} onChange={set('durationMin')} error={errors.durationMin} />
        ) : (
          <span className="hide-sm" />
        )}
        <TextField label="السعر" required type="number" inputMode="decimal" step="any" min={0} value={v.price} onChange={set('price')} error={errors.price} />
        <SelectField label="العملة" required value={v.currency} onChange={set('currency')} options={currencyOptions(s)} error={errors.currency} />
        <TextAreaField label="الوصف" value={v.description} onChange={set('description')} error={errors.description} className="span-2" maxLength={300} />
        <label className="check span-2">
          <input type="checkbox" checked={v.active} onChange={(e) => set('active')(e.target.checked)} />
          <span>متاح للطلب</span>
        </label>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

function CompleteDialog({ order, onClose }: { order: ServiceOrder; onClose: () => void }) {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const s = data.settings;
  const spa = order.department === 'spa';
  const [method, setMethod] = useState<PaymentMethod>(order.method);
  const [rate, setRate] = useState(numStr(order.rateToBase));
  const total = orderTotals(order).total;
  const direct = order.billing === 'direct';

  const submit = () => {
    const res = run((d) => completeOrder(d, order.id, direct ? { method, rateToBase: order.currency === s.baseCurrency ? 1 : toNum(rate) } : undefined));
    if (res.ok) {
      toast.success(direct ? 'تم التحصيل وإغلاق الطلب.' : spa ? 'تم تسجيل الجلسة على حساب الغرفة.' : 'تم التقديم وإضافته لحساب الغرفة.');
      onClose();
    } else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  return (
    <Modal
      title={spa ? 'إتمام الجلسة' : 'إتمام الطلب'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>تراجع</Button>
          <Button variant="success" onClick={submit}>
            {direct ? 'تحصيل وإغلاق' : 'تأكيد'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p style={{ margin: 0 }}>
          {orderLabel(order)} — المستحق <strong>{f.money(total, order.currency)}</strong>
        </p>
        {direct ? (
          <>
            <SelectField label="طريقة الدفع" value={method} onChange={(x) => setMethod(x as PaymentMethod)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
            {order.currency !== s.baseCurrency ? (
              <TextField label={`سعر الصرف (1 ${order.currency} = ؟ ${s.baseCurrency})`} type="number" step="any" value={rate} onChange={setRate} />
            ) : null}
            <Alert tone="info">يُسجَّل المبلغ ضمن الإيرادات بتاريخ الطلب.</Alert>
          </>
        ) : (
          <Alert tone="info">المبلغ مُضاف بالفعل إلى فاتورة الإقامة، ويُحصَّل مع دفعات الحجز.</Alert>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export default function ServicesPage({ department }: { department: Department }) {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const today = useToday();
  const t = TEXT[department];
  const spa = department === 'spa';

  const [tab, setTab] = useState<'orders' | 'catalog'>('orders');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [billing, setBilling] = useState('');
  const [date, setDate] = useState('');
  const [cat, setCat] = useState('');
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | 'new' | null>(null);
  const [completing, setCompleting] = useState<ServiceOrder | null>(null);
  const [cancelling, setCancelling] = useState<ServiceOrder | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<ServiceOrder | null>(null);
  const [editingItem, setEditingItem] = useState<ServiceItem | 'new' | null>(null);
  const [deletingItem, setDeletingItem] = useState<ServiceItem | null>(null);

  const orders = useMemo(() => data.orders.filter((o) => o.department === department), [data.orders, department]);
  const items = useMemo(() => data.serviceItems.filter((x) => x.department === department), [data.serviceItems, department]);

  const who = (o: ServiceOrder) => {
    if (o.billing === 'direct') return { name: o.customerName, sub: spa ? 'عميل خارجي' : 'زائر' };
    const r = data.reservations.find((x) => x.id === o.reservationId);
    return {
      name: r ? (guestById(data, r.guestId)?.fullName ?? '—') : '—',
      sub: r ? `غرفة ${roomById(data, r.roomId)?.number ?? '—'} · ${reservationLabel(r)}` : '',
    };
  };

  const todayOrders = orders.filter((o) => o.date === today && o.status !== 'cancelled');
  const salesToday = roundCur(todayOrders.reduce((s2, o) => s2 + orderSalesBase(data, o), 0), data.settings.baseCurrency);
  const openCount = orders.filter((o) => o.status === 'open').length;
  const roomToday = todayOrders.filter((o) => o.billing === 'room').length;

  const rows = useMemo(
    () =>
      orders.filter((o) => {
        if (status && o.status !== status) return false;
        if (billing && o.billing !== billing) return false;
        if (date && o.date !== date) return false;
        if (q.trim()) {
          const w = who(o);
          if (!includesText(`${orderLabel(o)} ${w.name} ${w.sub} ${o.place} ${o.lines.map((l) => l.name).join(' ')}`, q)) return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, status, billing, date, q, data],
  );

  const run1 = (fn: Parameters<typeof run>[0], okMsg: string) => {
    const res = run(fn);
    if (res.ok) toast.success(okMsg);
    else toast.error(res.error ?? 'تعذّر تنفيذ العملية.');
  };

  const orderCols: Column<ServiceOrder>[] = [
    { key: 'no', header: spa ? 'الموعد' : 'الطلب', render: (o) => <strong>{orderLabel(o)}</strong>, sort: (o) => o.number },
    {
      key: 'when',
      header: 'التاريخ والوقت',
      render: (o) => (
        <span>
          {f.date(o.date)} <span className="muted ltr">{o.time}</span>
        </span>
      ),
      sort: (o) => `${o.date} ${o.time}`,
    },
    {
      key: 'who',
      header: 'العميل',
      render: (o) => {
        const w = who(o);
        return (
          <div>
            <div>{w.name}</div>
            <div className="muted small">{w.sub}</div>
          </div>
        );
      },
      sort: (o) => who(o).name,
    },
    {
      key: 'items',
      header: spa ? 'الخدمات' : 'الأصناف',
      render: (o) => <span className="clamp">{o.lines.map((l) => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name)).join('، ')}</span>,
    },
    { key: 'place', header: t.place, render: (o) => o.place || '—' },
    { key: 'total', header: 'المبلغ', render: (o) => <strong className="num">{f.money(orderTotals(o).total, o.currency)}</strong>, sort: (o) => orderSalesBase(data, o) },
    {
      key: 'billing',
      header: 'المحاسبة',
      render: (o) => (o.billing === 'room' ? <Badge tone="info">على الغرفة</Badge> : o.settled ? <Badge tone="success">مدفوع</Badge> : <Badge tone="warning">لم يُحصَّل</Badge>),
    },
    { key: 'status', header: 'الحالة', render: (o) => <Badge tone={STATUS_TONE[o.status]}>{ORDER_STATUS_LABELS[department][o.status]}</Badge>, sort: (o) => o.status },
    {
      key: 'actions',
      header: '',
      actions: true,
      render: (o) => (
        <div className="row-actions">
          {o.status === 'open' ? (
            <>
              <IconButton label={o.billing === 'direct' ? 'تحصيل وإغلاق' : spa ? 'تمت الجلسة' : 'تم التقديم'} onClick={() => setCompleting(o)}>
                <CheckCheck size={17} />
              </IconButton>
              <IconButton label="تعديل" onClick={() => setEditingOrder(o)}>
                <Pencil size={17} />
              </IconButton>
              <IconButton label="إلغاء" onClick={() => setCancelling(o)}>
                <Ban size={17} />
              </IconButton>
            </>
          ) : null}
          {o.billing === 'room' && o.reservationId ? (
            <Link to={`/invoices/${o.reservationId}`} className="icon-btn" aria-label="فاتورة الإقامة" title="فاتورة الإقامة">
              <Receipt size={17} />
            </Link>
          ) : null}
          {o.status !== 'completed' ? (
            <IconButton label="حذف" danger onClick={() => setDeletingOrder(o)}>
              <Trash2 size={17} />
            </IconButton>
          ) : null}
        </div>
      ),
    },
  ];

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) if (o.status !== 'cancelled') for (const l of o.lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty);
    return m;
  }, [orders]);
  const categories = [...new Set(items.map((x) => x.category))].sort((a, b) => a.localeCompare(b, 'ar'));
  const itemRows = items.filter((x) => (!cat || x.category === cat) && (!q.trim() || includesText(`${x.name} ${x.category} ${x.description}`, q)));

  const itemCols: Column<ServiceItem>[] = [
    {
      key: 'name',
      header: spa ? 'الخدمة' : 'الصنف',
      render: (x) => (
        <div>
          <strong>{x.name}</strong>
          {x.description ? <div className="muted small clamp">{x.description}</div> : null}
        </div>
      ),
      sort: (x) => x.name,
    },
    { key: 'cat', header: 'التصنيف', render: (x) => x.category, sort: (x) => x.category },
    ...(spa ? [{ key: 'dur', header: 'المدة', render: (x: ServiceItem) => `${f.int(x.durationMin)} دقيقة`, sort: (x: ServiceItem) => x.durationMin }] : []),
    { key: 'price', header: 'السعر', render: (x) => <strong className="num">{f.money(x.price, x.currency)}</strong>, sort: (x) => x.price * (getRate(data.settings, x.currency) ?? 1) },
    { key: 'sold', header: spa ? 'مرات الحجز' : 'الكمية المباعة', render: (x) => f.int(usage.get(x.id) ?? 0), sort: (x) => usage.get(x.id) ?? 0 },
    { key: 'active', header: 'الحالة', render: (x) => (x.active ? <Badge tone="success">متاح</Badge> : <Badge tone="neutral">موقوف</Badge>), sort: (x) => (x.active ? 0 : 1) },
    {
      key: 'actions',
      header: '',
      actions: true,
      render: (x) => (
        <div className="row-actions">
          <IconButton label={x.active ? 'إيقاف' : 'تفعيل'} onClick={() => run1((d) => setServiceItemActive(d, x.id, !x.active), x.active ? 'تم الإيقاف.' : 'تم التفعيل.')}>
            <Power size={17} />
          </IconButton>
          <IconButton label="تعديل" onClick={() => setEditingItem(x)}>
            <Pencil size={17} />
          </IconButton>
          <IconButton label="حذف" danger onClick={() => setDeletingItem(x)}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      ),
    },
  ];

  const Icon = spa ? Flower2 : UtensilsCrossed;

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          tab === 'orders' ? (
            <Button variant="primary" onClick={() => setEditingOrder('new')}>
              <Plus size={18} /> {t.newOrder}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setEditingItem('new')}>
              <Plus size={18} /> {t.addItem}
            </Button>
          )
        }
      />

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatCard icon={<Icon size={22} />} label={spa ? 'مواعيد اليوم' : 'طلبات اليوم'} value={f.int(todayOrders.length)} sub={`${f.int(roomToday)} على حساب الغرف`} />
        <StatCard icon={<Clock size={22} />} label={spa ? 'مواعيد قادمة مفتوحة' : 'طلبات قيد التحضير'} value={f.int(openCount)} tone="warning" />
        <StatCard icon={<Wallet size={22} />} label="مبيعات اليوم" value={f.base(salesToday)} tone="success" sub="بالعملة الأساسية" />
        <StatCard icon={<Receipt size={22} />} label={spa ? 'خدمات متاحة' : 'أصناف متاحة'} value={f.int(items.filter((x) => x.active).length)} sub={`من ${f.int(items.length)}`} />
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'orders'} className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
          {t.ordersTab}
        </button>
        <button role="tab" aria-selected={tab === 'catalog'} className={`tab ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>
          {t.catalogTab}
        </button>
      </div>

      {tab === 'orders' ? (
        <Card pad={false}>
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} placeholder={`اسم العميل أو رقم الغرفة أو ${spa ? 'الخدمة' : 'الصنف'}…`} />
            <TextField label="التاريخ" type="date" value={date} onChange={setDate} />
            <SelectField label="الحالة" value={status} onChange={setStatus} placeholder="الكل" options={(['open', 'completed', 'cancelled'] as OrderStatus[]).map((k) => ({ value: k, label: ORDER_STATUS_LABELS[department][k] }))} />
            <SelectField
              label="المحاسبة"
              value={billing}
              onChange={setBilling}
              placeholder="الكل"
              options={[
                { value: 'room', label: 'على حساب الغرفة' },
                { value: 'direct', label: 'دفع مباشر' },
              ]}
            />
          </div>
          <DataTable
            columns={orderCols}
            rows={rows}
            rowKey={(o) => o.id}
            pageSize={data.settings.pageSize}
            initialSort={{ key: 'when', dir: 'desc' }}
            empty={
              orders.length === 0 ? (
                <EmptyState
                  icon={<Icon size={26} />}
                  title={t.emptyOrders}
                  text={items.length === 0 ? `ابدأ بإضافة ${t.catalogTab} ثم سجّل أول ${spa ? 'موعد' : 'طلب'}.` : `سجّل أول ${spa ? 'موعد' : 'طلب'}.`}
                  action={
                    items.length === 0 ? (
                      <Button variant="primary" onClick={() => setTab('catalog')}>
                        {t.catalogTab}
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={() => setEditingOrder('new')}>
                        <Plus size={18} /> {t.newOrder}
                      </Button>
                    )
                  }
                />
              ) : (
                <EmptyState title="لا توجد نتائج" text="جرّب تغيير البحث أو عوامل التصفية." />
              )
            }
          />
        </Card>
      ) : (
        <Card pad={false}>
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} placeholder={`ابحث في ${t.catalogTab}…`} />
            <SelectField label="التصنيف" value={cat} onChange={setCat} placeholder="كل التصنيفات" options={categories.map((c) => ({ value: c, label: c }))} />
          </div>
          <DataTable
            columns={itemCols}
            rows={itemRows}
            rowKey={(x) => x.id}
            pageSize={data.settings.pageSize}
            initialSort={{ key: 'cat', dir: 'asc' }}
            empty={
              items.length === 0 ? (
                <EmptyState
                  icon={<Icon size={26} />}
                  title={t.emptyCatalog}
                  text={t.emptyCatalogText}
                  action={
                    <Button variant="primary" onClick={() => setEditingItem('new')}>
                      <Plus size={18} /> {t.addItem}
                    </Button>
                  }
                />
              ) : (
                <EmptyState title="لا توجد نتائج" text="جرّب تغيير البحث أو التصنيف." />
              )
            }
          />
        </Card>
      )}

      {editingOrder ? <OrderForm department={department} order={editingOrder === 'new' ? undefined : editingOrder} onClose={() => setEditingOrder(null)} /> : null}
      {completing ? <CompleteDialog order={completing} onClose={() => setCompleting(null)} /> : null}
      {cancelling ? (
        <ConfirmDialog
          danger
          title={spa ? 'إلغاء الموعد' : 'إلغاء الطلب'}
          confirmLabel="إلغاء"
          message={<>هل تريد إلغاء {orderLabel(cancelling)}؟{cancelling.billing === 'room' ? ' سيُحذف المبلغ من فاتورة الإقامة.' : ''}</>}
          onConfirm={() => {
            run1((d) => cancelOrder(d, cancelling.id), 'تم الإلغاء.');
            setCancelling(null);
          }}
          onCancel={() => setCancelling(null)}
        />
      ) : null}
      {deletingOrder ? (
        <ConfirmDialog
          danger
          title="حذف نهائي"
          confirmLabel="حذف"
          message={<>هل تريد حذف {orderLabel(deletingOrder)} نهائيًا؟ لا يمكن التراجع.</>}
          onConfirm={() => {
            run1((d) => deleteOrder(d, deletingOrder.id), 'تم الحذف.');
            setDeletingOrder(null);
          }}
          onCancel={() => setDeletingOrder(null)}
        />
      ) : null}
      {editingItem ? <ItemForm department={department} item={editingItem === 'new' ? undefined : editingItem} onClose={() => setEditingItem(null)} /> : null}
      {deletingItem ? (
        <ConfirmDialog
          danger
          title={`حذف ${t.itemWord}`}
          confirmLabel="حذف"
          message={<>هل تريد حذف «{deletingItem.name}»؟ إذا كان مستخدمًا في طلبات سابقة سيُرفض الحذف ويمكنك إيقافه بدلًا من ذلك.</>}
          onConfirm={() => {
            run1((d) => deleteServiceItem(d, deletingItem.id), 'تم الحذف.');
            setDeletingItem(null);
          }}
          onCancel={() => setDeletingItem(null)}
        />
      ) : null}
    </>
  );
}

export function SpaPage() {
  return <ServicesPage key="spa" department="spa" />;
}
export function RestaurantPage() {
  return <ServicesPage key="restaurant" department="restaurant" />;
}
