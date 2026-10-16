import { useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { ReservationStatusBadge } from '../components/badges';
import GuestForm from '../components/GuestForm';
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
  type Column,
} from '../components/ui';
import { useFmt } from '../hooks/useApp';
import { deleteGuest } from '../lib/actions';
import { ID_TYPE_LABELS } from '../lib/labels';
import { reservationFinance, reservationLabel, roomById } from '../lib/logic';
import type { Guest } from '../lib/types';
import { includesText } from '../lib/ui-helpers';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';

function GuestView({ guest, onClose }: { guest: Guest; onClose: () => void }) {
  const { data } = useData();
  const f = useFmt();
  const list = data.reservations.filter((r) => r.guestId === guest.id).sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1));
  return (
    <Modal title={guest.fullName} onClose={onClose} footer={<Button onClick={onClose}>إغلاق</Button>}>
      <dl className="kv">
        <div><dt>الهاتف</dt><dd><span className="ltr">{guest.phone || '—'}</span></dd></div>
        <div><dt>البريد الإلكتروني</dt><dd><span className="ltr">{guest.email || '—'}</span></dd></div>
        <div><dt>الجنسية</dt><dd>{guest.nationality || '—'}</dd></div>
        <div><dt>الهوية</dt><dd>{guest.idType ? `${ID_TYPE_LABELS[guest.idType]} — ${guest.idNumber}` : '—'}</dd></div>
        <div><dt>العنوان</dt><dd>{guest.address || '—'}</dd></div>
        <div><dt>ملاحظات</dt><dd>{guest.notes || '—'}</dd></div>
      </dl>
      <h3 className="card-title" style={{ margin: '22px 0 8px' }}>سجل الحجوزات</h3>
      {list.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>لا توجد حجوزات لهذا النزيل.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {list.map((r) => {
            const fin = reservationFinance(r, data.payments, data.orders);
            return (
              <div key={r.id} className="card" style={{ padding: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>
                    {reservationLabel(r)} — غرفة {roomById(data, r.roomId)?.number ?? '—'}
                  </strong>
                  <ReservationStatusBadge status={r.status} />
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {f.date(r.checkIn)} ← {f.date(r.checkOut)} · الإجمالي {f.money(fin.total, r.currency)} · المتبقي {f.money(fin.balance, r.currency)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default function Guests() {
  const { data, run } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Guest | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Guest | null>(null);

  const rows = useMemo(
    () => data.guests.filter((g) => !q.trim() || includesText(`${g.fullName} ${g.phone} ${g.idNumber} ${g.email}`, q)),
    [data.guests, q],
  );
  const stays = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.reservations) m.set(r.guestId, (m.get(r.guestId) ?? 0) + 1);
    return m;
  }, [data.reservations]);

  const confirmDelete = () => {
    if (!deleting) return;
    const res = run((d) => deleteGuest(d, deleting.id));
    if (res.ok) toast.success('تم حذف النزيل.');
    else toast.error(res.error ?? 'تعذّر الحذف.');
    setDeleting(null);
  };

  const columns: Column<Guest>[] = [
    { key: 'name', header: 'الاسم', render: (g) => <strong>{g.fullName}</strong>, sort: (g) => g.fullName },
    { key: 'phone', header: 'الهاتف', render: (g) => <span className="ltr">{g.phone}</span>, sort: (g) => g.phone },
    { key: 'nat', header: 'الجنسية', render: (g) => g.nationality || '—', sort: (g) => g.nationality },
    { key: 'id', header: 'الهوية', render: (g) => (g.idType ? `${ID_TYPE_LABELS[g.idType]}: ${g.idNumber}` : '—') },
    { key: 'stays', header: 'الحجوزات', render: (g) => stays.get(g.id) ?? 0, sort: (g) => stays.get(g.id) ?? 0 },
    {
      key: 'actions',
      header: '',
      actions: true,
      render: (g) => (
        <div className="row-actions">
          <IconButton label="عرض" onClick={() => setViewing(g.id)}>
            <Eye size={17} />
          </IconButton>
          <IconButton label="تعديل" onClick={() => setEditing(g)}>
            <Pencil size={17} />
          </IconButton>
          <IconButton label="حذف" danger onClick={() => setDeleting(g)}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      ),
    },
  ];

  const viewingGuest = viewing ? data.guests.find((g) => g.id === viewing) : undefined;

  return (
    <>
      <PageHeader
        title="النزلاء"
        subtitle="سجل بيانات النزلاء وتاريخ حجوزاتهم"
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> إضافة نزيل
          </Button>
        }
      />
      <Card pad={false}>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="الاسم أو الهاتف أو رقم الهوية…" />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(g) => g.id}
          pageSize={data.settings.pageSize}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={
            data.guests.length === 0 ? (
              <EmptyState
                icon={<Users size={26} />}
                title="لا يوجد نزلاء بعد"
                text="أضف نزيلًا لتتمكن من إنشاء حجز باسمه."
                action={
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    <Plus size={18} /> إضافة نزيل
                  </Button>
                }
              />
            ) : (
              <EmptyState title="لا توجد نتائج" text="لا يوجد نزيل يطابق بحثك." />
            )
          }
        />
      </Card>
      {editing ? <GuestForm guest={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {viewingGuest ? <GuestView guest={viewingGuest} onClose={() => setViewing(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          danger
          title="حذف النزيل"
          confirmLabel="حذف"
          message={
            <>
              هل تريد حذف النزيل <strong>{deleting.fullName}</strong>؟ لا يمكن حذف نزيل لديه حجوزات مسجلة.
            </>
          }
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}
