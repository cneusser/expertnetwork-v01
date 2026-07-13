import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

export default function Login() {
  const { login } = useAuth();
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
        'linkedin-kein-konto': 'Zu dieser LinkedIn-E-Mail existiert kein Konto. Bitte registrieren Sie sich zuerst regulär — danach können Sie sich mit LinkedIn anmelden.',
        'linkedin-state': 'LinkedIn-Anmeldung abgebrochen (Sicherheitsprüfung). Bitte erneut versuchen.',
        'linkedin-abgebrochen': 'LinkedIn-Anmeldung abgebrochen.',
        'linkedin-nicht-konfiguriert': 'LinkedIn-Anmeldung ist derzeit nicht eingerichtet.',
        'email-nicht-bestaetigt': 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.',
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
      navigate(user.role === 'vendor' ? '/vendor' : ['admin', 'tenant_owner'].includes(user.role) ? '/admin' : '/dashboard');
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
        <h1>Anmelden</h1>
        <p className="sub">Privates Expertennetzwerk der Phalanx GmbH</p>
        {error && <div className="msg msg-error">{error}</div>}
        <div className="field">
          <label htmlFor="email">E-Mail-Adresse</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">Passwort</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Anmelden…' : 'Anmelden'}</button>
        {liEnabled && (
          <button type="button" className="btn" style={{ marginTop: 10, background: '#0A66C2' }}
            onClick={() => { window.location.href = '/api/auth/linkedin'; }}>
            Mit LinkedIn anmelden
          </button>
        )}
        <div className="auth-links">
          <span><Link to="/register">Als Experte</Link> · <Link to="/register-kunde">Als Kunde registrieren</Link></span>
          <Link to="/forgot-password">Passwort vergessen?</Link>
        </div>
      </form>
    </div>
  );
}
