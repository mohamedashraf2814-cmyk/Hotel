import { useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  IconButton,
  PageHeader,
  SelectField,
  Spinner,
  TextAreaField,
  TextField,
} from '../components/ui';
import { useFmt } from '../hooks/useApp';
import { updateSettings } from '../lib/actions';
import { buildBackup, parseBackup } from '../lib/backup';
import { CURRENCY_CATALOG, currencyInfo, roundRate } from '../lib/currencies';
import { downloadText } from '../lib/download';
import type { AppData, DigitsMode, FieldErrors } from '../lib/types';
import { approximateUsageBytes, isPersistent } from '../lib/storage';
import { numStr, toNum } from '../lib/ui-helpers';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';

function HotelSection() {
  const { data, run } = useData();
  const toast = useToast();
  const s = data.settings;
  const [v, setV] = useState({ hotelName: s.hotelName, phone: s.phone, email: s.email, address: s.address, website: s.website, invoiceNote: s.invoiceNote });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof v>(k: K) => (val: string) => setV((p) => ({ ...p, [k]: val }));

  const save = () => {
    const res = run((d) => updateSettings(d, { ...d.settings, ...v }));
    if (res.ok) {
      setErrors({});
      toast.success('تم حفظ بيانات الفندق.');
    } else if (res.errors) setErrors(res.errors);
    else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  return (
    <Card title="بيانات الفندق">
      <form
        className="form-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField label="اسم الفندق" required value={v.hotelName} onChange={set('hotelName')} error={errors.hotelName} className="span-2" />
        <TextField label="الهاتف" type="tel" value={v.phone} onChange={set('phone')} error={errors.phone} />
        <TextField label="البريد الإلكتروني" type="email" value={v.email} onChange={set('email')} error={errors.email} />
        <TextField label="العنوان" value={v.address} onChange={set('address')} error={errors.address} className="span-2" />
        <TextField label="الموقع الإلكتروني" value={v.website} onChange={set('website')} error={errors.website} className="span-2" />
        <TextAreaField label="ملاحظة أسفل الفاتورة" value={v.invoiceNote} onChange={set('invoiceNote')} error={errors.invoiceNote} className="span-2" maxLength={300} />
        <div className="span-2">
          <Button variant="primary" type="submit">
            حفظ بيانات الفندق
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface CurRow {
  code: string;
  rate: string;
}

function CurrencySection() {
  const { data, run } = useData();
  const toast = useToast();
  const s = data.settings;
  const hasFinancial = data.payments.length > 0 || data.expenses.length > 0;
  const [base, setBase] = useState(s.baseCurrency);
  const [rows, setRows] = useState<CurRow[]>(s.currencies.map((c) => ({ code: c.code, rate: numStr(c.rate) })));
  const [adding, setAdding] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const available = CURRENCY_CATALOG.filter((c) => !rows.some((r) => r.code === c.code));

  const changeBase = (code: string) => {
    // re-express every rate relative to the new base currency (cross rates)
    const newBaseRate = toNum(rows.find((r) => r.code === code)?.rate ?? '');
    if (!Number.isFinite(newBaseRate) || newBaseRate <= 0) {
      setBase(code);
      return;
    }
    setRows((prev) =>
      prev.map((r) => {
        if (r.code === code) return { ...r, rate: '1' };
        const old = toNum(r.rate);
        return { ...r, rate: Number.isFinite(old) ? numStr(roundRate(old / newBaseRate)) : r.rate };
      }),
    );
    setBase(code);
  };

  const addCurrency = () => {
    if (!adding) return;
    setRows((p) => [...p, { code: adding, rate: '' }]);
    setAdding('');
  };

  const save = () => {
    const currencies = rows.map((r) => ({ code: r.code, rate: r.code === base ? 1 : toNum(r.rate) }));
    const res = run((d) =>
      updateSettings(d, {
        ...d.settings,
        baseCurrency: base,
        currencies,
        defaultRoomCurrency: currencies.some((c) => c.code === d.settings.defaultRoomCurrency) ? d.settings.defaultRoomCurrency : base,
      }),
    );
    if (res.ok) {
      setErrors({});
      toast.success('تم حفظ العملات وأسعار الصرف.');
    } else if (res.errors) setErrors(res.errors);
    else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  return (
    <Card title="العملات وأسعار الصرف">
      <div className="stack">
        <Alert tone="info">
          فعّل العملات التي تتعامل بها وأدخل سعر صرف كل عملة مقابل العملة الأساسية (مثال: 1 USD = 50 {base}). الأسعار تُدخل يدويًا ولا تُجلب من الإنترنت، ويُحفظ سعر الصرف مع كل دفعة ومصروف وقت تسجيله فلا تتغير السجلات القديمة عند تعديل الأسعار.
        </Alert>
        <SelectField
          label="العملة الأساسية (للتقارير والإجماليات)"
          value={base}
          onChange={changeBase}
          options={rows.map((r) => ({ value: r.code, label: `${r.code} — ${currencyInfo(r.code).nameAr}` }))}
          disabled={hasFinancial}
          error={errors.baseCurrency}
          hint={hasFinancial ? 'لا يمكن تغييرها بعد تسجيل دفعات أو مصروفات.' : 'عند تغييرها تُحوَّل أسعار الصرف الحالية تلقائيًا إلى العملة الجديدة.'}
        />
        <div>
          <div className="label" style={{ marginBottom: 8 }}>العملات المفعّلة</div>
          <div className="stack" style={{ gap: 10 }}>
            {rows.map((r) => (
              <div key={r.code} className="row" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <strong>{r.code}</strong> <span className="muted">— {currencyInfo(r.code).nameAr} ({currencyInfo(r.code).symbol})</span>
                </div>
                <div style={{ flex: '1 1 220px' }}>
                  <TextField
                    label={`1 ${r.code} = ؟ ${base}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={r.code === base ? '1' : r.rate}
                    disabled={r.code === base}
                    onChange={(val) => setRows((p) => p.map((x) => (x.code === r.code ? { ...x, rate: val } : x)))}
                  />
                </div>
                <IconButton
                  label={`إزالة ${r.code}`}
                  danger
                  disabled={r.code === base}
                  onClick={() => setRows((p) => p.filter((x) => x.code !== r.code))}
                >
                  <Trash2 size={17} />
                </IconButton>
              </div>
            ))}
          </div>
          {errors.currencies ? (
            <div style={{ marginTop: 10 }}>
              <Alert tone="danger">{errors.currencies}</Alert>
            </div>
          ) : null}
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px' }}>
            <SelectField
              label="إضافة عملة"
              value={adding}
              onChange={setAdding}
              placeholder="اختر عملة…"
              options={available.map((c) => ({ value: c.code, label: `${c.code} — ${c.nameAr}` }))}
            />
          </div>
          <Button onClick={addCurrency} disabled={!adding}>
            <Plus size={17} /> إضافة
          </Button>
        </div>
        <div>
          <Button variant="primary" onClick={save}>
            حفظ العملات
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PreferencesSection() {
  const { data, run } = useData();
  const toast = useToast();
  const s = data.settings;
  const [v, setV] = useState({
    defaultRoomPrice: numStr(s.defaultRoomPrice),
    defaultRoomCurrency: s.defaultRoomCurrency,
    pageSize: String(s.pageSize),
    digits: s.digits as DigitsMode,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const save = () => {
    const res = run((d) =>
      updateSettings(d, {
        ...d.settings,
        defaultRoomPrice: v.defaultRoomPrice.trim() === '' ? 0 : toNum(v.defaultRoomPrice),
        defaultRoomCurrency: v.defaultRoomCurrency,
        pageSize: Number(v.pageSize),
        digits: v.digits,
      }),
    );
    if (res.ok) {
      setErrors({});
      toast.success('تم حفظ التفضيلات.');
    } else if (res.errors) setErrors(res.errors);
    else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  return (
    <Card title="التسعير والتفضيلات">
      <form
        className="form-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField
          label="السعر الافتراضي لليلة (عند إضافة غرفة)"
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={v.defaultRoomPrice}
          onChange={set('defaultRoomPrice')}
          error={errors.defaultRoomPrice}
        />
        <SelectField
          label="عملة الغرف الافتراضية"
          value={v.defaultRoomCurrency}
          onChange={set('defaultRoomCurrency')}
          options={s.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${currencyInfo(c.code).nameAr}` }))}
          error={errors.defaultRoomCurrency}
        />
        <SelectField
          label="عدد الصفوف في الجداول"
          value={v.pageSize}
          onChange={set('pageSize')}
          options={['10', '20', '50'].map((x) => ({ value: x, label: x }))}
          error={errors.pageSize}
        />
        <SelectField
          label="شكل الأرقام"
          value={v.digits}
          onChange={(x) => set('digits')(x as DigitsMode)}
          options={[
            { value: 'latn', label: 'أرقام لاتينية (1 2 3)' },
            { value: 'arab', label: 'أرقام عربية (١ ٢ ٣)' },
          ]}
          error={errors.digits}
        />
        <div className="span-2">
          <Button variant="primary" type="submit">
            حفظ التفضيلات
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DataSection({ onReset }: { onReset: () => void }) {
  const { data, replaceAll, clearAll } = useData();
  const f = useFmt();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [pending, setPending] = useState<{ data: AppData; exportedAt?: string; name: string } | null>(null);
  const [clearing, setClearing] = useState(false);

  const exportJson = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`hotel-backup-${stamp}.json`, buildBackup(data), 'application/json;charset=utf-8');
    toast.success('تم تنزيل النسخة الاحتياطية.');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError('');
    if (file.size > 20 * 1024 * 1024) {
      setImportError('حجم الملف كبير جدًا.');
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseBackup(text);
      if (!parsed.ok) setImportError(parsed.error);
      else setPending({ data: parsed.data, exportedAt: parsed.exportedAt, name: file.name });
    } catch {
      setImportError('تعذّرت قراءة الملف.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    const res = replaceAll(pending.data);
    if (res.ok) {
      toast.success('تمت استعادة النسخة الاحتياطية.');
      onReset();
    } else toast.error(res.error);
    setPending(null);
  };

  const confirmClear = () => {
    clearAll();
    onReset();
    setClearing(false);
    toast.success('تم حذف كل البيانات المحفوظة.');
  };

  const kb = Math.round(approximateUsageBytes() / 1024);
  const counts = (d: AppData) =>
    `${d.rooms.length} غرفة، ${d.guests.length} نزيل، ${d.reservations.length} حجز، ${d.payments.length} دفعة، ${d.expenses.length} مصروف`;

  return (
    <Card title="النسخ الاحتياطي والبيانات">
      <div className="stack">
        <Alert tone="warning">
          بياناتك محفوظة داخل هذا المتصفح وعلى هذا الجهاز فقط، ولا تُرسل إلى أي خادم ولا تتزامن بين الأجهزة. مسح بيانات المتصفح أو تغيير المتصفح قد يمسحها. صدّر نسخة احتياطية بانتظام وتجنّب تخزين بيانات حساسة.
        </Alert>
        <div className="row">
          <Button variant="primary" onClick={exportJson}>
            <Download size={17} /> تصدير نسخة احتياطية (JSON)
          </Button>
          <Button onClick={() => fileRef.current?.click()} loading={importing}>
            <Upload size={17} /> استيراد نسخة احتياطية
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="اختيار ملف النسخة الاحتياطية" />
        </div>
        {importing ? <Spinner label="جارٍ قراءة الملف والتحقق منه…" /> : null}
        {importError ? <Alert tone="danger">{importError} لم يتم تغيير أي بيانات.</Alert> : null}
        <div className="muted">
          الحالي: {counts(data)}. {isPersistent() ? `حجم التخزين التقريبي ${f.int(kb)} ك.بايت.` : 'التخزين الدائم غير متاح.'}
        </div>
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
        <div>
          <h3 className="card-title" style={{ marginBottom: 6 }}>حذف كل البيانات</h3>
          <p className="muted" style={{ marginTop: 0 }}>يعيد النظام فارغًا كما في أول استخدام. لا يمكن التراجع، فصدّر نسخة احتياطية أولًا.</p>
          <Button variant="danger" onClick={() => setClearing(true)}>
            <Trash2 size={17} /> حذف كل البيانات
          </Button>
        </div>
      </div>

      {pending ? (
        <ConfirmDialog
          danger
          title="استبدال البيانات الحالية"
          confirmLabel="استعادة واستبدال"
          message={
            <>
              <p style={{ marginTop: 0 }}>الملف: <strong className="ltr">{pending.name}</strong></p>
              <p>يحتوي على: {counts(pending.data)}.</p>
              {pending.exportedAt ? <p>تاريخ التصدير: {f.dateTime(pending.exportedAt)}</p> : null}
              <Alert tone="warning">سيتم استبدال كل البيانات الحالية ({counts(data)}) بمحتوى هذا الملف.</Alert>
            </>
          }
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {clearing ? (
        <ConfirmDialog
          danger
          title="حذف كل البيانات"
          confirmLabel="نعم، احذف كل شيء"
          message={
            <>
              <p style={{ marginTop: 0 }}>سيتم حذف جميع الغرف والنزلاء والحجوزات والدفعات والمصروفات والإعدادات المحفوظة في هذا المتصفح نهائيًا.</p>
              <Alert tone="danger">هذا الإجراء لا يمكن التراجع عنه.</Alert>
            </>
          }
          onConfirm={confirmClear}
          onCancel={() => setClearing(false)}
        />
      ) : null}
    </Card>
  );
}

export default function Settings() {
  // bumped after a restore / clear so the forms reload the new settings
  const [epoch, setEpoch] = useState(0);
  return (
    <>
      <PageHeader title="الإعدادات" subtitle="بيانات الفندق والعملات والتفضيلات والنسخ الاحتياطي" />
      <div className="stack">
        <HotelSection key={`h${epoch}`} />
        <CurrencySection key={`c${epoch}`} />
        <PreferencesSection key={`p${epoch}`} />
        <DataSection onReset={() => setEpoch((e) => e + 1)} />
      </div>
    </>
  );
}
