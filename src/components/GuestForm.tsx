import { useState } from 'react';
import { ID_TYPES, addGuest, updateGuest, type GuestInput } from '../lib/actions';
import { ID_TYPE_LABELS } from '../lib/labels';
import type { FieldErrors, Guest, IdType } from '../lib/types';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';
import { Alert, Button, Modal, SelectField, TextAreaField, TextField } from './ui';

export default function GuestForm({ guest, onClose, onSaved }: { guest?: Guest; onClose: () => void; onSaved?: (id: string) => void }) {
  const { run } = useData();
  const toast = useToast();
  const [v, setV] = useState({
    fullName: guest?.fullName ?? '',
    phone: guest?.phone ?? '',
    email: guest?.email ?? '',
    nationality: guest?.nationality ?? '',
    idType: (guest?.idType ?? '') as IdType,
    idNumber: guest?.idNumber ?? '',
    address: guest?.address ?? '',
    notes: guest?.notes ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = () => {
    const input: GuestInput = { ...v };
    const res = run((d) => (guest ? updateGuest(d, guest.id, input) : addGuest(d, input)));
    if (res.ok) {
      toast.success(guest ? 'تم حفظ بيانات النزيل.' : 'تمت إضافة النزيل.');
      onSaved?.(res.id ?? '');
      onClose();
    } else if (res.errors) setErrors(res.errors);
    else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  return (
    <Modal
      title={guest ? 'تعديل بيانات نزيل' : 'إضافة نزيل'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit}>
            {guest ? 'حفظ التعديلات' : 'إضافة النزيل'}
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
        <TextField label="الاسم الكامل" required value={v.fullName} onChange={set('fullName')} error={errors.fullName} className="span-2" autoComplete="off" />
        <TextField label="رقم الهاتف" required type="tel" inputMode="tel" value={v.phone} onChange={set('phone')} error={errors.phone} />
        <TextField label="البريد الإلكتروني" type="email" value={v.email} onChange={set('email')} error={errors.email} />
        <TextField label="الجنسية" value={v.nationality} onChange={set('nationality')} error={errors.nationality} />
        <SelectField
          label="نوع الهوية"
          value={v.idType}
          onChange={(x) => set('idType')(x as IdType)}
          options={ID_TYPES.map((t) => ({ value: t, label: ID_TYPE_LABELS[t] }))}
          error={errors.idType}
        />
        <TextField label="رقم الهوية" value={v.idNumber} onChange={set('idNumber')} error={errors.idNumber} className="span-2" autoComplete="off" />
        <div className="span-2">
          <Alert tone="warning">بيانات المتصفح غير مشفّرة. تجنّب حفظ أرقام هويات حقيقية إذا كان الجهاز مشتركًا، أو اكتفِ بآخر أرقام قليلة للتمييز.</Alert>
        </div>
        <TextField label="العنوان" value={v.address} onChange={set('address')} error={errors.address} className="span-2" />
        <TextAreaField label="ملاحظات" value={v.notes} onChange={set('notes')} error={errors.notes} className="span-2" maxLength={500} />
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
