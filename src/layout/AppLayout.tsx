import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, Search, X } from 'lucide-react';
import { CommandPalette } from '../components/CommandPalette';
import { NAV } from './nav';
import { Alert, IconButton } from '../components/ui';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';

export default function AppLayout() {
  const { data, persistent, warnings, dismissWarnings } = useData();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [cmd, setCmd] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmd((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
        <button type="button" className="cmd-trigger" onClick={() => setCmd(true)}>
          <Search size={16} aria-hidden="true" />
          <span>بحث سريع</span>
          <kbd>Ctrl K</kbd>
        </button>
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
          <span style={{ marginInlineStart: 'auto' }}>
            <IconButton label="فتح لوحة الأوامر" onClick={() => setCmd(true)}>
              <Search size={20} />
            </IconButton>
          </span>
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
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      {cmd ? <CommandPalette onClose={() => setCmd(false)} /> : null}
    </div>
  );
}
