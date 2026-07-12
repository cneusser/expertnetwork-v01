import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState('busy'); // busy | ok | error

  useEffect(() => {
    const token = params.get('token');
    if (!token) return setState('error');
    api.post('/api/auth/verify', { token })
      .then(() => setState('ok'))
      .catch(() => setState('error'));
  }, [params]);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <h1>E-Mail-Bestätigung</h1>
        {state === 'busy' && <p className="sub">Wird geprüft…</p>}
        {state === 'ok' && (
          <div className="msg msg-success">Ihre E-Mail-Adresse ist bestätigt. Sie können sich jetzt anmelden.</div>
        )}
        {state === 'error' && (
          <div className="msg msg-error">Der Link ist ungültig oder abgelaufen.</div>
        )}
        <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
      </div>
    </div>
  );
}
