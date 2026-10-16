import { useEffect, useState } from 'react';
import { BedDouble, Eye, EyeOff, Flower2, LogIn, Receipt, UtensilsCrossed } from 'lucide-react';
import { IconButton } from '../components/ui';

export default function Login({ onLogin }: { onLogin: (u: string, p: string, remember: boolean) => boolean }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

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
        setShake(true);
        window.setTimeout(() => setShake(false), 450);
      }
    }, 350);
  };

  return (
    <div className="login">
      <div className="login-bg" aria-hidden="true">
        <span className="orb o1" />
        <span className="orb o2" />
      </div>

      <section className="login-art" aria-hidden="true">
        <div className="wordmark">MERAK · HOTEL &amp; SPA</div>
        <div className="login-hero">
          <h1>Merak</h1>
          <p className="login-tag">ضيافة راقية تُدار بإتقان، من الاستقبال إلى السبا والمطعم.</p>
          <p>إدارة الغرف والحجوزات والحسابات من شاشة واحدة.</p>
        </div>
        <div className="login-feats">
          {[
            [BedDouble, 'الغرف والحجوزات'],
            [Flower2, 'السبا والمواعيد'],
            [UtensilsCrossed, 'المطعم وخدمة الغرف'],
            [Receipt, 'فواتير متعددة العملات'],
          ].map(([Icon, text], i) => {
            const I = Icon as typeof BedDouble;
            return (
              <div className="login-feat" style={{ ['--i' as string]: i }} key={text as string}>
                <I size={18} /> {text as string}
              </div>
            );
          })}
        </div>
      </section>

      <main className="login-panel">
        <form className={`login-card stack ${shake ? 'shake' : ''}`} onSubmit={submit} noValidate>
          <div>
            <div className="login-mark" aria-hidden="true">M</div>
            <h2>تسجيل الدخول</h2>
            <p className="login-sub">مرحبًا بك في لوحة إدارة Merak.</p>
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
              <IconButton label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShow((v) => !v)}>
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

          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} aria-hidden="true" /> : <LogIn size={18} />} دخول
          </button>
          <p className="login-note">الدخول لهذا الجهاز فقط. بياناتك محفوظة داخل المتصفح.</p>
        </form>
      </main>
    </div>
  );
}
