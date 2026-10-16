import { useMemo, useState } from 'react';
import { Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
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
  StatCard,
  TextAreaField,
  TextField,
  type Column,
} from '../components/ui';
import { useFmt, useToday } from '../hooks/useApp';
import { EXPENSE_CATEGORIES, addExpense, deleteExpense, updateExpense, type ExpenseInput } from '../lib/actions';
import { roundCur } from '../lib/currencies';
import { EXPENSE_CATEGORY_LABELS } from '../lib/labels';
import { getRate, toBase } from '../lib/logic';
import type { Expense, ExpenseCategory, FieldErrors } from '../lib/types';
import { currencyOptions, includesText, numStr, toNum } from '../lib/ui-helpers';
import { useData } from '../store/DataContext';
import { useToast } from '../store/ToastContext';

function ExpenseForm({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const { data, run } = useData();
  const toast = useToast();
  const today = useToday();
  const s = data.settings;
  const [v, setV] = useState({
    category: (expense?.category ?? 'supplies') as ExpenseCategory,
    amount: expense ? numStr(expense.amount) : '',
    currency: expense?.currency ?? s.baseCurrency,
    rateToBase: expense ? numStr(expense.rateToBase) : '1',
    date: expense?.date ?? today,
    description: expense?.description ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const isBase = v.currency === s.baseCurrency;

  const submit = () => {
    const input: ExpenseInput = {
      category: v.category,
      amount: toNum(v.amount),
      currency: v.currency,
      rateToBase: isBase ? 1 : toNum(v.rateToBase),
      date: v.date,
      description: v.description,
    };
    const res = run((d) => (expense ? updateExpense(d, expense.id, input) : addExpense(d, input)));
    if (res.ok) {
      toast.success(expense ? 'تم حفظ تعديلات المصروف.' : 'تم تسجيل المصروف.');
      onClose();
    } else if (res.errors) setErrors(res.errors);
    else toast.error(res.error ?? 'تعذّر الحفظ.');
  };

  const amountN = toNum(v.amount);
  const rateN = isBase ? 1 : toNum(v.rateToBase);
  const baseEq = Number.isFinite(amountN) && Number.isFinite(rateN) && amountN > 0 && rateN > 0 ? toBase(amountN, rateN, s) : undefined;

  return (
    <Modal
      title={expense ? 'تعديل مصروف' : 'إضافة مصروف'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit}>
            {expense ? 'حفظ التعديلات' : 'إضافة المصروف'}
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
        <SelectField
          label="التصنيف"
          required
          value={v.category}
          onChange={(x) => set('category')(x as ExpenseCategory)}
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))}
          error={errors.category}
        />
        <TextField label="التاريخ" required type="date" value={v.date} max={today} onChange={set('date')} error={errors.date} />
        <TextField label="المبلغ" required type="number" inputMode="decimal" step="any" min={0} value={v.amount} onChange={set('amount')} error={errors.amount} />
        <SelectField
          label="العملة"
          required
          value={v.currency}
          onChange={(code) => setV((p) => ({ ...p, currency: code, rateToBase: numStr(getRate(s, code) ?? 1) }))}
          options={currencyOptions(s)}
          error={errors.currency}
        />
        <TextField
          label={`سعر الصرف (1 ${v.currency} = ؟ ${s.baseCurrency})`}
          required
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={isBase ? '1' : v.rateToBase}
          onChange={set('rateToBase')}
          error={errors.rateToBase}
          disabled={isBase}
          className="span-2"
          hint={baseEq !== undefined && !isBase ? `يعادل ${roundCur(baseEq, s.baseCurrency)} ${s.baseCurrency}` : undefined}
        />
        <TextAreaField label="الوصف" required value={v.description} onChange={set('description')} error={errors.description} className="span-2" maxLength={300} />
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function Expenses() {
  const { data, run } = useData();
  const f = useFmt();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const rows = useMemo(
    () =>
      data.expenses.filter((x) => {
        if (category && x.category !== category) return false;
        if (from && x.date < from) return false;
        if (to && x.date > to) return false;
        if (q.trim() && !includesText(`${x.description} ${EXPENSE_CATEGORY_LABELS[x.category]}`, q)) return false;
        return true;
      }),
    [data.expenses, q, category, from, to],
  );
  const total = roundCur(rows.reduce((s, x) => s + toBase(x.amount, x.rateToBase, data.settings), 0), data.settings.baseCurrency);

  const confirmDelete = () => {
    if (!deleting) return;
    const res = run((d) => deleteExpense(d, deleting.id));
    if (res.ok) toast.success('تم حذف المصروف.');
    else toast.error(res.error ?? 'تعذّر الحذف.');
    setDeleting(null);
  };

  const columns: Column<Expense>[] = [
    { key: 'date', header: 'التاريخ', render: (x) => f.date(x.date), sort: (x) => x.date },
    { key: 'cat', header: 'التصنيف', render: (x) => EXPENSE_CATEGORY_LABELS[x.category], sort: (x) => EXPENSE_CATEGORY_LABELS[x.category] },
    { key: 'desc', header: 'الوصف', render: (x) => x.description, sort: (x) => x.description },
    { key: 'amount', header: 'المبلغ', render: (x) => <strong className="num">{f.money(x.amount, x.currency)}</strong>, sort: (x) => x.amount },
    { key: 'base', header: 'بالعملة الأساسية', render: (x) => <span className="num">{f.base(toBase(x.amount, x.rateToBase, data.settings))}</span>, sort: (x) => toBase(x.amount, x.rateToBase, data.settings) },
    {
      key: 'actions',
      header: '',
      actions: true,
      render: (x) => (
        <div className="row-actions">
          <IconButton label="تعديل" onClick={() => setEditing(x)}>
            <Pencil size={17} />
          </IconButton>
          <IconButton label="حذف" danger onClick={() => setDeleting(x)}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المصروفات"
        subtitle="تسجيل مصروفات الفندق بأي عملة مفعّلة"
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> إضافة مصروف
          </Button>
        }
      />
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatCard icon={<Wallet size={22} />} label="إجمالي المصروفات (حسب التصفية)" value={f.base(total)} tone="danger" sub="بالعملة الأساسية" />
        <StatCard icon={<Receipt size={22} />} label="عدد السجلات" value={f.int(rows.length)} />
      </div>
      <Card pad={false}>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="ابحث في الوصف أو التصنيف…" />
          <SelectField label="التصنيف" value={category} onChange={setCategory} placeholder="الكل" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))} />
          <TextField label="من تاريخ" type="date" value={from} onChange={setFrom} />
          <TextField label="إلى تاريخ" type="date" value={to} min={from || undefined} onChange={setTo} />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(x) => x.id}
          pageSize={data.settings.pageSize}
          initialSort={{ key: 'date', dir: 'desc' }}
          empty={
            data.expenses.length === 0 ? (
              <EmptyState
                icon={<Receipt size={26} />}
                title="لا توجد مصروفات مسجلة"
                text="سجّل مصروفات الفندق لتظهر في لوحة التحكم والتقارير."
                action={
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    <Plus size={18} /> إضافة مصروف
                  </Button>
                }
              />
            ) : (
              <EmptyState title="لا توجد نتائج" text="جرّب تغيير البحث أو عوامل التصفية." />
            )
          }
        />
      </Card>
      {editing ? <ExpenseForm expense={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          danger
          title="حذف مصروف"
          confirmLabel="حذف"
          message={
            <>
              هل تريد حذف المصروف «{deleting.description}» بقيمة <strong>{f.money(deleting.amount, deleting.currency)}</strong>؟ سيتغير إجمالي المصروفات والأرباح.
            </>
          }
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}
