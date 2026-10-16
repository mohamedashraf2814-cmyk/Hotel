import { useMemo, useState } from 'react';
import { BedDouble, Eye, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { RoomStatusBadge, ReservationStatusBadge } from '../components/badges';
import {
  Alert,
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
  TextAreaField,
  TextField,
  type Column,
} from '../components/ui';
import { useFmt, useToday } from '../hooks/useApp';
import { ROOM_TYPES, addRoom, deleteRoom, setRoomStatus, updateRoom, type RoomInput } from '../lib/actions';
import { MANUAL_ROOM_STATUSES, ROOM_STATUS_LABELS, ROOM_TYPE_LABELS } from '../lib/labels';
import { effectiveRoomStatus, guestById, reservationLabel } from '../lib/logic';
import type { FieldErrors, ManualRoomStatus, Room, RoomStatus, RoomType } from '../lib/types';
import { currencyOptions, includesText, numStr, toNum } from '../lib/ui-helpers';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';

function RoomForm({ room, onClose }: { room?: Room; onClose: () => void }) {
  const { data, run } = useData();
  const toast = useToast();
  const s = data.settings;
  const [v, setV] = useState({
    number: room?.number ?? '',
    type: (room?.type ?? 'double') as RoomType,
    floor: room ? String(room.floor) : '1',
    capacity: room ? String(room.capacity) : '2',
    pricePerNight: room ? numStr(room.pricePerNight) : s.defaultRoomPrice > 0 ? numStr(s.defaultRoomPrice) : '',
    currency: room?.currency ?? s.defaultRoomCurrency,
    status: (room?.status ?? 'available') as ManualRoomStatus,
    description: room?.description ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = () => {
    const input: RoomInput = {
      number: v.number,
      type: v.type,
      floor: toNum(v.floor),
      capacity: toNum(v.capacity),
      pricePerNight: toNum(v.pricePerNight),
      currency: v.currency,
      status: v.status,
      description: v.description,
    };
    const res = run((d) => (room ? updateRoom(d, room.id, input) : addRoom(d, input)));
    if (res.ok) {
      toast.success(room ? 'تم حفظ تعديلات الغرفة.' : 'تمت إضافة الغرفة.');
      onClose();
    } else if (res.errors) {
      setErrors(res.errors);
    } else {
      toast.error(res.error ?? 'تعذّر الحفظ.');
    }
  };

  return (
    <Modal
      title={room ? `تعديل الغرفة ${room.number}` : 'إضافة غرفة'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit}>
            {room ? 'حفظ التعديلات' : 'إضافة الغرفة'}
          </Button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <TextField label="رقم الغرفة" required value={v.number} onChange={set('number')} error={errors.number} maxLength={10} />
        <SelectField
          label="نوع الغرفة"
          required
          value={v.type}
          onChange={(x) => set('type')(x as RoomType)}
          options={ROOM_TYPES.map((t) => ({ value: t, label: ROOM_TYPE_LABELS[t] }))}
          error={errors.type}
        />
        <TextField label="الطابق" required type="number" inputMode="numeric" value={v.floor} onChange={set('floor')} error={errors.floor} />
        <TextField label="سعة النزلاء" required type="number" inputMode="numeric" min={1} value={v.capacity} onChange={set('capacity')} error={errors.capacity} />
        <TextField label="سعر الليلة" required type="number" inputMode="decimal" step="any" min={0} value={v.pricePerNight} onChange={set('pricePerNight')} error={errors.pricePerNight} />
        <SelectField label="عملة السعر" required value={v.currency} onChange={set('currency')} options={currencyOptions(s)} error={errors.currency} />
        <SelectField
          label="حالة الغرفة"
          value={v.status}
          onChange={(x) => set('status')(x as ManualRoomStatus)}
          options={MANUAL_ROOM_STATUSES.map((k) => ({ value: k, label: ROOM_STATUS_LABELS[k] }))}
          error={errors.status}
          hint="حالتا «مشغولة» و«محجوزة» تظهران تلقائيًا من الحجوزات."
          className="span-2"
        />
        <TextAreaField label="الوصف" value={v.description} onChange={set('description')} error={errors.description} className="span-2" maxLength={500} />
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

function RoomView({ room, status, onClose }: { room: Room; status: RoomStatus; onClose: () => void }) {
  const { data } = useData();
  const f = useFmt();
  const list = data.reservations
    .filter((r) => r.roomId === room.id && (r.status === 'confirmed' || r.status === 'checked_in'))
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
  return (
    <Modal title={`تفاصيل الغرفة ${room.number}`} onClose={onClose} footer={<Button onClick={onClose}>إغلاق</Button>}>
      <dl className="kv">
        <div><dt>الحالة</dt><dd><RoomStatusBadge status={status} /></dd></div>
        <div><dt>النوع</dt><dd>{ROOM_TYPE_LABELS[room.type]}</dd></div>
        <div><dt>الطابق</dt><dd>{f.int(room.floor)}</dd></div>
        <div><dt>السعة</dt><dd>{f.int(room.capacity)} نزلاء</dd></div>
        <div><dt>سعر الليلة</dt><dd>{f.money(room.pricePerNight, room.currency)}</dd></div>
        <div><dt>الوصف</dt><dd>{room.description || '—'}</dd></div>
      </dl>
      <h3 className="card-title" style={{ margin: '22px 0 8px' }}>الحجوزات النشطة والقادمة</h3>
      {list.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>لا توجد حجوزات نشطة لهذه الغرفة.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {list.map((r) => (
            <div key={r.id} className="row card" style={{ padding: 12, justifyContent: 'space-between' }}>
              <span>
                <strong>{reservationLabel(r)}</strong> — {guestById(data, r.guestId)?.fullName ?? '—'}
                <span className="muted"> ({f.date(r.checkIn)} ← {f.date(r.checkOut)})</span>
              </span>
              <ReservationStatusBadge status={r.status} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function Rooms() {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const today = useToday();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState<Room | 'new' | null>(null);
  const [viewing, setViewing] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);

  const rows = useMemo(
    () =>
      data.rooms
        .map((room) => ({ room, status: effectiveRoomStatus(room, data.reservations, today) }))
        .filter(
          ({ room, status }) =>
            (!statusFilter || status === statusFilter) &&
            (!typeFilter || room.type === typeFilter) &&
            (!q.trim() || includesText(`${room.number} ${room.description} ${ROOM_TYPE_LABELS[room.type]}`, q)),
        ),
    [data.rooms, data.reservations, today, q, statusFilter, typeFilter],
  );

  const markAvailable = (room: Room) => {
    const res = run((d) => setRoomStatus(d, room.id, 'available'));
    if (res.ok) toast.success(`الغرفة ${room.number} أصبحت متاحة.`);
    else toast.error(res.error ?? 'تعذّر التحديث.');
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const res = run((d) => deleteRoom(d, deleting.id));
    if (res.ok) toast.success('تم حذف الغرفة.');
    else toast.error(res.error ?? 'تعذّر الحذف.');
    setDeleting(null);
  };

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'number', header: 'رقم الغرفة', render: ({ room }) => <strong>{room.number}</strong>, sort: ({ room }) => room.number },
    { key: 'type', header: 'النوع', render: ({ room }) => ROOM_TYPE_LABELS[room.type], sort: ({ room }) => ROOM_TYPE_LABELS[room.type] },
    { key: 'floor', header: 'الطابق', render: ({ room }) => f.int(room.floor), sort: ({ room }) => room.floor },
    { key: 'capacity', header: 'السعة', render: ({ room }) => f.int(room.capacity), sort: ({ room }) => room.capacity },
    {
      key: 'price',
      header: 'سعر الليلة',
      render: ({ room }) => <span className="num">{f.money(room.pricePerNight, room.currency)}</span>,
      sort: ({ room }) => room.pricePerNight,
    },
    { key: 'status', header: 'الحالة', render: ({ status }) => <RoomStatusBadge status={status} />, sort: ({ status }) => ROOM_STATUS_LABELS[status] },
    {
      key: 'actions',
      header: '',
      actions: true,
      render: ({ room, status }) => (
        <div className="row-actions">
          {status === 'cleaning' || status === 'maintenance' ? (
            <IconButton label="تحويل إلى متاحة" onClick={() => markAvailable(room)}>
              <Sparkles size={17} />
            </IconButton>
          ) : null}
          <IconButton label="عرض" onClick={() => setViewing(room)}>
            <Eye size={17} />
          </IconButton>
          <IconButton label="تعديل" onClick={() => setEditing(room)}>
            <Pencil size={17} />
          </IconButton>
          <IconButton label="حذف" danger onClick={() => setDeleting(room)}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      ),
    },
  ];

  const viewingStatus = viewing ? effectiveRoomStatus(viewing, data.reservations, today) : 'available';
  const liveViewing = viewing ? data.rooms.find((r) => r.id === viewing.id) ?? null : null;

  return (
    <>
      <PageHeader
        title="الغرف"
        subtitle="إدارة غرف الفندق وأسعارها وحالتها"
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> إضافة غرفة
          </Button>
        }
      />
      <Card pad={false}>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="رقم الغرفة أو الوصف…" />
          <SelectField
            label="الحالة"
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="كل الحالات"
            options={(Object.keys(ROOM_STATUS_LABELS) as RoomStatus[]).map((k) => ({ value: k, label: ROOM_STATUS_LABELS[k] }))}
          />
          <SelectField
            label="النوع"
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="كل الأنواع"
            options={ROOM_TYPES.map((t) => ({ value: t, label: ROOM_TYPE_LABELS[t] }))}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={({ room }) => room.id}
          pageSize={data.settings.pageSize}
          initialSort={{ key: 'number', dir: 'asc' }}
          empty={
            data.rooms.length === 0 ? (
              <EmptyState
                icon={<BedDouble size={26} />}
                title="لا توجد غرف بعد"
                text="أضف أول غرفة لتبدأ في استقبال الحجوزات."
                action={
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    <Plus size={18} /> إضافة غرفة
                  </Button>
                }
              />
            ) : (
              <EmptyState title="لا توجد نتائج" text="جرّب تغيير البحث أو عوامل التصفية." />
            )
          }
        />
      </Card>

      {editing ? <RoomForm room={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {liveViewing ? <RoomView room={liveViewing} status={viewingStatus} onClose={() => setViewing(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          danger
          title="حذف الغرفة"
          confirmLabel="حذف"
          message={
            <>
              <p style={{ marginTop: 0 }}>هل تريد حذف الغرفة <strong>{deleting.number}</strong> نهائيًا؟</p>
              <Alert tone="warning">لا يمكن حذف غرفة لها حجوزات مسجلة، وسيظهر لك سبب الرفض في هذه الحالة.</Alert>
            </>
          }
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}
