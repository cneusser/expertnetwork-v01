/**
 * Öffentliche Einladungs-/Einwilligungsseite (Token aus der Invite- bzw.
 * Reconsent-Mail). Invite: Einwilligung + Passwort. Renew (?renew=1): nur Einwilligung.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';

export default function Einladung() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const renew = params.get('renew') === '1';
  const [consentText, setConsentText] = useState('');
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/auth/consent-text').then((d) => setConsentText(d.text)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    try {
      const d = renew
        ? await api.post('/api/auth/renew-consent', { token })
        : await api.post('/api/auth/accept-invite', { token, password, consent });
      setDone(true);
      setMsg(d.message);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h1>{renew ? 'Einwilligung erneuern' : 'Zugang aktivieren'}</h1>
        {done ? (
          <>
            <div className="msg msg-success">{msg}</div>
            <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
          </>
        ) : (
          <>
            <p className="sub">
              {renew
                ? 'Bitte bestätigen Sie die weitere Speicherung Ihres Profils im Phalanx Expert Network.'
                : 'Die Phalanx GmbH hat ein Profil für Sie angelegt. Mit Ihrer Einwilligung erhalten Sie vollen Self-Service-Zugriff.'}
            </p>
            {msg && <div className="msg msg-error">{msg}</div>}
            <div className="field">
              <label>Einwilligung zur Datenverarbeitung (DSGVO)</label>
              <div className="consent-box">{consentText || 'Einwilligungstext wird geladen…'}</div>
              <label className="consent-check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
                <span>Ich habe den Einwilligungstext gelesen und stimme zu. Widerruf jederzeit möglich.</span>
              </label>
            </div>
            {!renew && (
              <div className="field">
                <label htmlFor="password">Passwort vergeben (mind. 10 Zeichen)</label>
                <input id="password" type="password" minLength={10} value={password}
                  onChange={(e) => setPassword(e.target.value)} required />
              </div>
            )}
            <button className="btn" disabled={busy || !consent}>
              {busy ? 'Senden…' : renew ? 'Einwilligung erneuern' : 'Zugang aktivieren'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
