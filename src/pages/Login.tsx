import { useEffect, useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, IconButton } from '../components/ui';

export default function Login({ onLogin }: { onLogin: (u: string, p: string, remember: boolean) => boolean }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Merak — تسجيل الدخول';
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('أدخل اسم المستخدم وكلمة المرور.');
      return;
    }
    setBusy(true);
    // a short pause so repeated guessing is not instant
    window.setTimeout(() => {
      const ok = onLogin(username, password, remember);
      setBusy(false);
      if (!ok) {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
        setPassword('');
      }
    }, 350);
  };

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <div className="wordmark">Merak · Hotel &amp; Spa</div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>Merak</h1>
          <p>إدارة الغرف والحجوزات والاستقبال والسبا والمطعم والحسابات من شاشة واحدة.</p>
        </div>
        <div className="login-feats">
          <span>الحجوزات والاستقبال</span>
          <span>السبا</span>
          <span>المطعم وخدمة الغرف</span>
          <span>الفواتير متعددة العملات</span>
          <span>التقارير</span>
        </div>
      </section>

      <main className="login-panel">
        <form className="login-card stack" onSubmit={submit} noValidate>
          <div>
            <div className="login-mark" aria-hidden="true">M</div>
            <h2>تسجيل الدخول</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>مرحبًا بك في لوحة إدارة Merak.</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="login-user">اسم المستخدم</label>
            <input
              id="login-user"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              dir="ltr"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={error ? true : undefined}
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="login-pass">كلمة المرور</label>
            <div className="pw">
              <input
                id="login-pass"
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-err' : undefined}
              />
              <IconButton label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShow((s) => !s)}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </IconButton>
            </div>
          </div>

          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>تذكرني على هذا الجهاز</span>
          </label>

          {error ? (
            <div className="alert alert-danger" id="login-err" role="alert">
              {error}
            </div>
          ) : null}

          <Button type="submit" variant="primary" loading={busy} className="w-full">
            <LogIn size={18} /> دخول
          </Button>
        </form>
      </main>
    </div>
  );
}
