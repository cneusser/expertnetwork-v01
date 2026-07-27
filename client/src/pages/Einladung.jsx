/**
 * v1.8.0 — Einladungs-Funnel für Eingeladene: drei klare Schritte statt
 * einem Formular. 1) Einwilligung lesen und erteilen, 2) Passwort vergeben,
 * 3) fertig, mit den nächsten sinnvollen Schritten.
 * Renew (?renew=1): nur Einwilligung erneuern (ein Schritt).
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';

const SCHRITTE = ['Einwilligung', 'Zugang', 'Fertig'];

function Stepper({ aktiv }) {
  return (
    <div style={{ display: 'flex', gap: 6, margin: '14px 0 20px' }}>
      {SCHRITTE.map((label, i) => (
        <div key={label} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            width: 26, height: 26, lineHeight: '26px', borderRadius: '50%', margin: '0 auto 4px',
            background: i <= aktiv ? 'var(--navy)' : 'var(--grey-200, #e3e6ea)',
            color: i <= aktiv ? '#fff' : 'var(--grey-400, #8a93a0)', fontSize: 13, fontWeight: 700,
          }}>{i + 1}</div>
          <span style={{ fontSize: 11, color: i <= aktiv ? 'var(--navy)' : 'var(--grey-400, #8a93a0)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Einladung() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const renew = params.get('renew') === '1';
  const [schritt, setSchritt] = useState(0);
  const [consentText, setConsentText] = useState('');
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/auth/consent-text').then((d) => setConsentText(d.text)).catch(() => {});
  }, []);

  const abschliessen = async () => {
    setMsg('');
    if (password.length < 10) { setMsg('Passwort: mindestens 10 Zeichen.'); return; }
    if (password !== password2) { setMsg('Die Passwörter stimmen nicht überein.'); return; }
    setBusy(true);
    try {
      await api.post('/api/auth/accept-invite', { token, password, consent });
      setSchritt(2);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const renewSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const d = await api.post('/api/auth/renew-consent', { token });
      setSchritt(2);
      setMsg(d.message);
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  };

  if (renew) {
    return (
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={renewSubmit}>
          <Logo />
          <h1>Einwilligung erneuern</h1>
          {schritt === 2 ? (
            <>
              <div className="msg msg-success">{msg || 'Vielen Dank, Ihre Einwilligung wurde erneuert.'}</div>
              <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
            </>
          ) : (
            <>
              {msg && <div className="msg msg-error">{msg}</div>}
              <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 13, background: 'var(--grey-100, #f4f6f8)', padding: 12, borderRadius: 6, margin: '12px 0', whiteSpace: 'pre-wrap' }}>{consentText}</div>
              <button className="btn" disabled={busy}>{busy ? 'Bitte warten…' : 'Einwilligung erneuern'}</button>
            </>
          )}
          <LegalFooter />
        </form>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <h1>Willkommen im Phalanx Expert Network</h1>
        <Stepper aktiv={schritt} />
        {msg && <div className="msg msg-error">{msg}</div>}

        {schritt === 0 && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.55 }}>
              Schön, dass Sie dabei sind. Bevor es losgeht, lesen Sie bitte kurz, wofür wir Ihre
              Daten verwenden. Ohne Ihre Einwilligung speichern wir nichts dauerhaft.
            </p>
            <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 13, background: 'var(--grey-100, #f4f6f8)', padding: 12, borderRadius: 6, margin: '12px 0', whiteSpace: 'pre-wrap' }}>{consentText || 'Laden…'}</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, margin: '10px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Ich willige in die Aufnahme in das Phalanx Expert Network ein. Ich kann die Einwilligung jederzeit widerrufen.</span>
            </label>
            <button className="btn" disabled={!consent} onClick={() => { setMsg(''); setSchritt(1); }}>Weiter</button>
          </>
        )}

        {schritt === 1 && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.55 }}>
              Fast geschafft. Vergeben Sie ein Passwort für Ihren Zugang.
            </p>
            <div className="field">
              <label>Passwort (mindestens 10 Zeichen)</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Passwort wiederholen</label>
              <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn" style={{ background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}
                onClick={() => setSchritt(0)}>Zurück</button>
              <button className="btn" disabled={busy} onClick={abschliessen}>{busy ? 'Bitte warten…' : 'Zugang anlegen'}</button>
            </div>
          </>
        )}

        {schritt === 2 && (
          <>
            <div className="msg msg-success">Ihr Zugang ist eingerichtet und Ihre Einwilligung dokumentiert.</div>
            <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 12 }}>
              So holen Sie am meisten heraus: Melden Sie sich an, vervollständigen Sie Ihr Profil
              (Kurzprofil, Skills, Tagessatz) und bestätigen Sie Ihre Verfügbarkeit. Das Dashboard
              zeigt Ihnen mit einer Checkliste, was noch fehlt, und schlägt passende Projekte vor.
            </p>
            <Link to="/login" className="btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 8 }}>Jetzt anmelden</Link>
          </>
        )}
        <LegalFooter />
      </div>
    </div>
  );
}
