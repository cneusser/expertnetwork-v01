import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
    } finally {
      setSent(true);
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h1>Passwort vergessen</h1>
        {sent ? (
          <div className="msg msg-success">
            Falls die Adresse registriert ist, haben wir Ihnen einen Link zum
            Zurücksetzen geschickt (1 Stunde gültig).
          </div>
        ) : (
          <>
            <p className="sub">Wir senden Ihnen einen Link zum Zurücksetzen.</p>
            <div className="field">
              <label htmlFor="email">E-Mail-Adresse</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <button className="btn" disabled={busy}>{busy ? 'Senden…' : 'Link anfordern'}</button>
          </>
        )}
        <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
      </form>
    </div>
  );
}
