import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consentText, setConsentText] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/auth/consent-text').then((d) => setConsentText(d.text)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/register', { email, password, consent });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <Logo />
          <h1>Fast geschafft</h1>
          <div className="msg msg-success">
            Wir haben Ihnen eine E-Mail geschickt. Bitte bestätigen Sie Ihre
            E-Mail-Adresse über den Link darin.
          </div>
          <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h1>Als Experte registrieren</h1>
        <p className="sub">Sie pflegen Ihr Profil selbst — Verfügbarkeit, Tagessätze, Dokumente.</p>
        {error && <div className="msg msg-error">{error}</div>}
        <div className="field">
          <label htmlFor="email">E-Mail-Adresse</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">Passwort (mind. 10 Zeichen)</label>
          <input id="password" type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="field">
          <label>Einwilligung zur Datenverarbeitung (DSGVO)</label>
          <div className="consent-box">{consentText || 'Einwilligungstext wird geladen…'}</div>
          <label className="consent-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>Ich habe den Einwilligungstext gelesen und stimme der Verarbeitung
            meiner Daten für den Experten-Pool zu. Widerruf jederzeit möglich.</span>
          </label>
        </div>
        <button className="btn" disabled={busy || !consent}>{busy ? 'Registrieren…' : 'Registrieren'}</button>
        <div className="auth-links"><Link to="/login">Bereits registriert? Anmelden</Link></div>
      </form>
      <LegalFooter />
    </div>
  );
}
