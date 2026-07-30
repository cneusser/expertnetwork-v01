import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { useLang, tr } from '../i18n';
import LegalFooter from '../components/LegalFooter';

export default function Login() {
  const { login } = useAuth();
  const { lang, setLang } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [liEnabled, setLiEnabled] = useState(false);
  const [params] = useSearchParams();

  useEffect(() => {
    fetch('/api/auth/linkedin/status').then((r) => r.json()).then((d) => setLiEnabled(d.enabled)).catch(() => {});
    const err = params.get('error');
    if (err) {
      setError({
        'linkedin-kein-konto': 'Zu dieser LinkedIn-E-Mail existiert kein Konto. Bitte registriere dich zuerst regulär, danach kannst du dich mit LinkedIn anmelden.',
        'linkedin-state': 'LinkedIn-Anmeldung abgebrochen (Sicherheitsprüfung). Bitte erneut versuchen.',
        'linkedin-abgebrochen': 'LinkedIn-Anmeldung abgebrochen.',
        'linkedin-nicht-konfiguriert': 'LinkedIn-Anmeldung ist derzeit nicht eingerichtet.',
        'email-nicht-bestaetigt': 'Bitte bestätige zuerst deine E-Mail-Adresse.',
        'linkedin-fehler': 'LinkedIn-Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
      }[err] || 'Anmeldung fehlgeschlagen.');
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'vendor' ? '/vendor' : user.role === 'provider' ? '/provider' : ['admin', 'tenant_owner'].includes(user.role) ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <div style={{ textAlign: 'right', fontSize: 12 }}>
          {['de', 'en'].map((L) => (
            <button key={L} type="button" onClick={() => setLang(L)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: lang === L ? 700 : 400, color: lang === L ? 'var(--navy)' : 'var(--grey-400, #8a93a0)' }}>{L.toUpperCase()}</button>
          ))}
        </div>
        <h1>{tr(lang, 'Anmelden', 'Log in')}</h1>
        <p className="sub">{tr(lang, 'Privates Expertennetzwerk der Phalanx GmbH', 'The private expert network of Phalanx GmbH')}</p>
        {error && <div className="msg msg-error">{error}</div>}
        <div className="field">
          <label htmlFor="email">{tr(lang, 'E-Mail-Adresse', 'Email address')}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">{tr(lang, 'Passwort', 'Password')}</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>{busy ? tr(lang, 'Anmelden…', 'Logging in…') : tr(lang, 'Anmelden', 'Log in')}</button>
        {liEnabled && (
          <button type="button" className="btn" style={{ marginTop: 10, background: '#0A66C2' }}
            onClick={() => { window.location.href = '/api/auth/linkedin'; }}>
            {tr(lang, 'Mit LinkedIn anmelden', 'Sign in with LinkedIn')}
          </button>
        )}
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--grey-100, #f4f6f8)', borderLeft: '3px solid var(--navy)', borderRadius: 6, fontSize: 13, lineHeight: 1.5 }}>
          <strong>{tr(lang, 'Assoziierte Partner', 'Associated partners')}</strong><br />
          {tr(lang,
            'Interim Manager mit eigenem Netzwerk? Verdiene an Empfehlungen, Projekten und gemeinsamer Umsetzung mit.',
            'An interim manager with a network of your own? Earn a share from referrals, projects and joint delivery.')}{' '}
          <Link to="/partner">{tr(lang, 'Mehr erfahren', 'Learn more')}</Link>
        </div>
        <div className="auth-links">
          <span><Link to="/register">Als Experte</Link> · <Link to="/register-kunde">Als Kunde registrieren</Link></span>
          <Link to="/forgot-password">Passwort vergessen?</Link>
        </div>
      </form>
      <LegalFooter />
    </div>
  );
}
