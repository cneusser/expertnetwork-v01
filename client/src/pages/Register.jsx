import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';

export default function Register() {
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consentText, setConsentText] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [hinweis, setHinweis] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/auth/consent-text').then((d) => setConsentText(d.text)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api.post('/api/auth/register', { email, password, consent, vorname, nachname, linkedin });
      if (d.einladung_erneut) { setHinweis(d.message); setDone(true); return; }
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
          <Logo variante="dunkel" form="stapel" zusatz="Expert Network" />
          <h1>Fast geschafft</h1>
          <div className="msg msg-success">
            {hinweis || 'Wir haben dir eine E-Mail geschickt. Bitte bestätige deine E-Mail-Adresse über den Link darin.'}
          </div>
          <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo variante="dunkel" form="stapel" zusatz="Expert Network" />
        <h1>Als Experte registrieren</h1>
        <p className="sub">Du pflegst dein Profil selbst: Verfügbarkeit, Tagessätze, Dokumente.</p>
        {error && <div className="msg msg-error">{error}</div>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="vorname">Vorname</label>
            <input id="vorname" type="text" value={vorname} onChange={(e) => setVorname(e.target.value)} required autoFocus />
          </div>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="nachname">Nachname</label>
            <input id="nachname" type="text" value={nachname} onChange={(e) => setNachname(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">E-Mail-Adresse</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="linkedin">LinkedIn-Profil (optional)</label>
          <input id="linkedin" type="text" placeholder="https://www.linkedin.com/in/..." value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)} />
          <span className="muted" style={{ fontSize: 12 }}>Hilft uns, dein vorbereitetes Profil zuzuordnen.</span>
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
      <p style={{ fontSize: 13, textAlign: 'center', marginTop: 14 }}>
          <Link to="/partner">Assoziierter Partner werden</Link>
        </p>
        <LegalFooter />
    </div>
  );
}
