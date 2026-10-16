import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  ConciergeBell,
  CreditCard,
  Flower2,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings as SettingsIcon,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { Alert, IconButton } from '../components/ui';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';

const NAV = [
  {
    group: 'الفندق',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, end: true },
      { to: '/reception', label: 'الاستقبال', icon: ConciergeBell },
      { to: '/reservations', label: 'الحجوزات', icon: CalendarCheck },
      { to: '/rooms', label: 'الغرف', icon: BedDouble },
      { to: '/guests', label: 'النزلاء', icon: Users },
    ],
  },
  {
    group: 'الخدمات',
    items: [
      { to: '/spa', label: 'السبا', icon: Flower2 },
      { to: '/restaurant', label: 'المطعم', icon: UtensilsCrossed },
    ],
  },
  {
    group: 'الحسابات',
    items: [
      { to: '/payments', label: 'المدفوعات والفواتير', icon: CreditCard },
      { to: '/expenses', label: 'المصروفات', icon: Receipt },
      { to: '/reports', label: 'التقارير', icon: BarChart3 },
      { to: '/settings', label: 'الإعدادات', icon: SettingsIcon },
    ],
  },
];

export default function AppLayout() {
  const { data, persistent, warnings, dismissWarnings } = useData();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = data.settings.hotelName && data.settings.hotelName !== 'Merak' ? `Merak — ${data.settings.hotelName}` : 'Merak — إدارة الفندق';
  }, [data.settings.hotelName]);

  return (
    <div className="app">
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="القائمة الرئيسية">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">M</div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">MERAK</div>
            <div className="brand-sub">{data.settings.hotelName && data.settings.hotelName !== 'Merak' ? data.settings.hotelName : 'Hotel & Spa'}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.group} role="group" aria-label={g.group} style={{ display: 'contents' }}>
              <div className="nav-group">{g.group}</div>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <n.icon size={19} aria-hidden="true" />
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <button type="button" className="logout" onClick={logout}>
            <LogOut size={17} aria-hidden="true" /> تسجيل الخروج
          </button>
          البيانات محفوظة داخل هذا المتصفح فقط. صدّر نسخة احتياطية دوريًا من الإعدادات.
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar no-print">
          <IconButton label={open ? 'إغلاق القائمة' : 'فتح القائمة'} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </IconButton>
          <strong style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', letterSpacing: '.14em', fontSize: 19 }}>MERAK</strong>
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
