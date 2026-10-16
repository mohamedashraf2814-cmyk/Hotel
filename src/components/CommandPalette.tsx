import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BedDouble, CalendarCheck, CornerDownLeft, Search, Users, Zap } from 'lucide-react';
import type { ComponentType } from 'react';
import { NAV, QUICK_ACTIONS } from '../layout/nav';
import { ROOM_TYPE_LABELS } from '../lib/labels';
import { guestById, reservationLabel, roomById } from '../lib/logic';
import { useData } from '../store/DataContext';

interface Item {
  key: string;
  to: string;
  label: string;
  hint?: string;
  group: string;
  icon: ComponentType<{ size?: number }>;
  hay: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { data } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo<Item[]>(() => {
    const items: Item[] = [];
    QUICK_ACTIONS.forEach((a) => items.push({ key: a.to, to: a.to, label: a.label, group: 'إجراءات سريعة', icon: a.icon, hay: norm(a.label) }));
    NAV.forEach((g) =>
      g.items.forEach((n) => items.push({ key: n.to, to: n.to, label: n.label, hint: g.group, group: 'الصفحات', icon: n.icon, hay: norm(n.label) })),
    );
    data.guests.forEach((g) =>
      items.push({ key: `g${g.id}`, to: '/guests', label: g.fullName, hint: g.phone, group: 'النزلاء', icon: Users, hay: norm(`${g.fullName} ${g.phone} ${g.idNumber}`) }),
    );
    data.rooms.forEach((r) =>
      items.push({ key: `r${r.id}`, to: '/rooms', label: `غرفة ${r.number}`, hint: ROOM_TYPE_LABELS[r.type] ?? r.type, group: 'الغرف', icon: BedDouble, hay: norm(`غرفة ${r.number}`) }),
    );
    data.reservations.forEach((r) => {
      const g = guestById(data, r.guestId)?.fullName ?? '';
      const rm = roomById(data, r.roomId)?.number ?? '';
      items.push({
        key: `v${r.id}`,
        to: `/invoices/${r.id}`,
        label: `حجز ${reservationLabel(r)} — ${g}`,
        hint: `غرفة ${rm}`,
        group: 'الحجوزات (فتح الفاتورة)',
        icon: CalendarCheck,
        hay: norm(`${reservationLabel(r)} ${r.number} ${g} ${rm}`),
      });
    });
    return items;
  }, [data]);

  const results = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return all.filter((x) => x.group === 'إجراءات سريعة' || x.group === 'الصفحات');
    return all.filter((x) => t.split(/\s+/).every((w) => x.hay.includes(w))).slice(0, 30);
  }, [all, q]);

  useEffect(() => setI(0), [q]);
  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [i]);

  const go = (it?: Item) => {
    if (!it) return;
    onClose();
    nav(it.to);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setI((v) => Math.min(results.length - 1, v + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setI((v) => Math.max(0, v - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[i]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="cmd-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="بحث سريع" onKeyDown={onKey}>
        <div className="cmd-input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن نزيل أو حجز أو غرفة، أو اكتب اسم صفحة…"
            aria-label="بحث"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmd-list" id="cmd-list" role="listbox" ref={listRef}>
          {results.length === 0 ? (
            <div className="cmd-empty">لا توجد نتائج لـ «{q}». جرّب اسم النزيل أو رقم الغرفة أو رقم الحجز.</div>
          ) : (
            results.map((it, idx) => {
              const head = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              const Icon = it.group === 'إجراءات سريعة' ? Zap : it.icon;
              return (
                <div key={it.key + idx}>
                  {head ? <div className="cmd-group">{head}</div> : null}
                  <div
                    role="option"
                    aria-selected={idx === i}
                    className={`cmd-item ${idx === i ? 'on' : ''}`}
                    onMouseMove={() => setI(idx)}
                    onClick={() => go(it)}
                  >
                    <span className="cmd-ico"><Icon size={16} /></span>
                    <span className="cmd-label">{it.label}</span>
                    {it.hint ? <span className="cmd-hint">{it.hint}</span> : null}
                    {idx === i ? <CornerDownLeft size={14} aria-hidden="true" /> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="cmd-foot">↑ ↓ للتنقل · Enter للفتح · Esc للإغلاق</div>
      </div>
    </div>
  );
}
