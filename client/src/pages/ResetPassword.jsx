import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', { token: params.get('token'), password });
      setDone(true);
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
        <h1>Neues Passwort vergeben</h1>
        {error && <div className="msg msg-error">{error}</div>}
        {done ? (
          <div className="msg msg-success">Passwort geändert. Sie können sich jetzt anmelden.</div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="password">Neues Passwort (mind. 10 Zeichen)</label>
              <input id="password" type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            </div>
            <button className="btn" disabled={busy}>{busy ? 'Speichern…' : 'Passwort speichern'}</button>
          </>
        )}
        <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
      </form>
    </div>
  );
}
