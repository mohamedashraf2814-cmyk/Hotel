import {
  Component,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ErrorInfo,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';
import { CountUp } from './CountUp';

// ---------- Buttons ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  small?: boolean;
  loading?: boolean;
}
export function Button({ variant = 'secondary', small, loading, className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${small ? 'btn-sm' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  danger,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${danger ? 'danger' : ''}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

// ---------- Layout bits ----------
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row no-print">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, actions, children, pad = true, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <div className="card-head">
          {title ? <h2 className="card-title">{title}</h2> : <span />}
          {actions ? <div className="row">{actions}</div> : null}
        </div>
      ) : null}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  );
}

export function StatCard({ icon, label, value, sub, tone, index = 0 }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'success' | 'warning' | 'danger'; index?: number }) {
  return (
    <div className={`card stat ${tone ? `tone-${tone}` : ''}`} style={{ ['--i' as string]: index }}>
      <div className={`stat-icon ${tone ?? ''}`}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{typeof value === 'string' ? <CountUp text={value} /> : value}</div>
        {sub ? <div className="stat-sub">{sub}</div> : null}
      </div>
    </div>
  );
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Inbox size={26} />}</div>
      <h3>{title}</h3>
      {text ? <p style={{ margin: 0, maxWidth: 420 }}>{text}</p> : null}
      {action}
    </div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'note'}>
      <AlertTriangle size={18} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

// ---------- Modal ----------
// Stack of open modals so that only the top-most one reacts to Escape / Tab.
const modalStack: symbol[] = [];

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}
export function Modal({ title, onClose, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const me = Symbol('modal');
    modalStack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    const focusables = () =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
          ).filter((el) => !el.hasAttribute('disabled'))
        : [];
    // focus the first form control, otherwise the first focusable element
    const first = node?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? focusables()[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const firstEl = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(me);
      if (i >= 0) modalStack.splice(i, 1);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal ${size === 'lg' ? 'modal-lg' : size === 'sm' ? 'modal-sm' : ''}`}>
        <div className="modal-head">
          <h2 id={titleId} className="card-title">
            {title}
          </h2>
          <IconButton label="إغلاق" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'تأكيد',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>تراجع</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ lineHeight: 1.8 }}>{message}</div>
    </Modal>
  );
}

// ---------- Form fields ----------
interface FieldShell {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

function Shell({ id, label, error, hint, required, children, className = '' }: FieldShell & { id: string; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className}`}>
      <label className="label" htmlFor={id}>
        {label}
        {required ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-err`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type TextFieldProps = FieldShell & {
  value: string;
  onChange: (v: string) => void;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>;

export function TextField({ label, error, hint, required, value, onChange, className, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
        {...rest}
      />
    </Shell>
  );
}

type SelectFieldProps = FieldShell & {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'className'>;

export function SelectField({ label, error, hint, required, value, onChange, options, placeholder, className, ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
        {...rest}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

type TextAreaFieldProps = FieldShell & {
  value: string;
  onChange: (v: string) => void;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'>;

export function TextAreaField({ label, error, hint, required, value, onChange, className, ...rest }: TextAreaFieldProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea
        id={id}
        className="textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
    </Shell>
  );
}

export function SearchBox({ value, onChange, placeholder = 'بحث…', label = 'بحث' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const id = useId();
  return (
    <div className="field grow">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="search">
        <Search size={17} aria-hidden="true" />
        <input id={id} className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}

// ---------- Data table ----------
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  actions?: boolean;
}

const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize,
  empty,
  initialSort,
  formatRange,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize: number;
  empty: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  formatRange?: (from: number, to: number, total: number) => string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return collator.compare(String(x), String(y)) * dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    setPage((p) => Math.min(p, pages));
  }, [pages]);
  const current = Math.min(page, pages);
  const slice = sorted.slice((current - 1) * pageSize, current * pageSize);

  if (!rows.length) return <>{empty}</>;

  const toggle = (c: Column<T>) => {
    if (!c.sort) return;
    setSort((s) => (s && s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }));
    setPage(1);
  };

  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, sorted.length);

  return (
    <>
      <div className="table-wrap">
        <table className="table rtable">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.sort ? 'sortable' : ''}
                  onClick={() => toggle(c)}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    {c.header}
                    {sort?.key === c.key ? sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} data-label={c.actions ? '' : c.header} className={c.actions ? 'actions-cell' : ''}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > pageSize ? (
        <div className="pager no-print">
          <span>{formatRange ? formatRange(from, to, sorted.length) : `${from}–${to} من ${sorted.length}`}</span>
          <div className="pager-btns">
            <IconButton label="الصفحة السابقة" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              <ChevronRight size={18} />
            </IconButton>
            <span>
              {current} / {pages}
            </span>
            <IconButton label="الصفحة التالية" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              <ChevronLeft size={18} />
            </IconButton>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------- Error boundary ----------
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ padding: 40, maxWidth: 520, margin: '60px auto' }}>
        <EmptyState
          icon={<AlertTriangle size={26} />}
          title="حدث خطأ غير متوقع"
          text="بياناتك المحفوظة في المتصفح لم تتأثر. أعد تحميل الصفحة للمتابعة."
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              إعادة التحميل
            </Button>
          }
        />
      </div>
    );
  }
}
