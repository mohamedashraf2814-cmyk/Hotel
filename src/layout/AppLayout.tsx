import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  ConciergeBell,
  CreditCard,
  Hotel,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings as SettingsIcon,
  Users,
  X,
} from 'lucide-react';
import { Alert, IconButton } from '../components/ui';
import { useData } from '../store/DataContext';

const NAV = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, end: true },
  { to: '/rooms', label: 'الغرف', icon: BedDouble },
  { to: '/guests', label: 'النزلاء', icon: Users },
  { to: '/reservations', label: 'الحجوزات', icon: CalendarCheck },
  { to: '/reception', label: 'الاستقبال', icon: ConciergeBell },
  { to: '/payments', label: 'المدفوعات والفواتير', icon: CreditCard },
  { to: '/expenses', label: 'المصروفات', icon: Receipt },
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon },
];

export default function AppLayout() {
  const { data, persistent, warnings, dismissWarnings } = useData();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${data.settings.hotelName} — نظام إدارة الفندق`;
  }, [data.settings.hotelName]);

  return (
    <div className="app">
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="القائمة الرئيسية">
        <div className="brand">
          <div className="brand-logo">
            <Hotel size={22} color="#fff" aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">{data.settings.hotelName}</div>
            <div className="brand-sub">نظام إدارة الفندق</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <n.icon size={19} aria-hidden="true" />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">البيانات محفوظة داخل هذا المتصفح فقط. صدّر نسخة احتياطية دوريًا من الإعدادات.</div>
      </aside>

      <div className="main-col">
        <header className="topbar no-print">
          <IconButton label={open ? 'إغلاق القائمة' : 'فتح القائمة'} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </IconButton>
          <strong>{data.settings.hotelName}</strong>
        </header>
        <main className="content">
          {!persistent ? (
            <div className="no-print" style={{ marginBottom: 16 }}>
              <Alert tone="danger">
                التخزين المحلي غير متاح في هذا المتصفح (ربما بسبب وضع التصفح الخاص أو إعدادات الخصوصية). ستعمل البيانات أثناء هذه الجلسة فقط وستضيع عند إغلاق الصفحة.
              </Alert>
            </div>
          ) : null}
          {warnings.length ? (
            <div className="no-print stack" style={{ marginBottom: 16 }}>
              {warnings.map((w) => (
                <Alert key={w} tone="warning">
                  {w}
                </Alert>
              ))}
              <div>
                <button className="btn btn-ghost btn-sm" onClick={dismissWarnings}>
                  إخفاء التنبيهات
                </button>
              </div>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
