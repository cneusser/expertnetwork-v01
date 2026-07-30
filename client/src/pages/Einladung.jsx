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

const TEXTE = {
  de: {
    schritte: ['Einwilligung', 'Zugang', 'Fertig'],
    titel: 'Willkommen im Phalanx Expert Network',
    intro: 'Schön, dass du dabei bist. Bevor es losgeht, lies bitte kurz, wofür wir deine Daten verwenden. Ohne deine Einwilligung speichern wir nichts dauerhaft.',
    consentLabel: 'Ich willige in die Aufnahme in das Phalanx Expert Network ein. Ich kann die Einwilligung jederzeit widerrufen.',
    weiter: 'Weiter', zurueck: 'Zurück',
    pwIntro: 'Fast geschafft. Vergib ein Passwort für deinen Zugang.',
    pwLabel: 'Passwort (mindestens 10 Zeichen)', pwWdh: 'Passwort wiederholen',
    pwKurz: 'Passwort: mindestens 10 Zeichen.', pwUngleich: 'Die Passwörter stimmen nicht überein.',
    anlegen: 'Zugang anlegen', warten: 'Bitte warten…',
    fertig: 'Dein Zugang ist eingerichtet und deine Einwilligung dokumentiert.',
    naechste: 'So holst du am meisten heraus: Melde dich an, vervollständige dein Profil (Kurzprofil, Skills, Tagessatz) und bestätige deine Verfügbarkeit. Das Dashboard zeigt dir mit einer Checkliste, was noch fehlt, und schlägt passende Projekte vor.',
    login: 'Jetzt anmelden', hinweisDe: null,
  },
  en: {
    schritte: ['Consent', 'Access', 'Done'],
    titel: 'Welcome to the Phalanx Expert Network',
    intro: 'Great to have you here. Before we start, please take a moment to read what we use your data for. Nothing is stored permanently without your consent.',
    consentLabel: 'I consent to being included in the Phalanx Expert Network. I can withdraw my consent at any time.',
    weiter: 'Continue', zurueck: 'Back',
    pwIntro: 'Almost there. Choose a password for your account.',
    pwLabel: 'Password (at least 10 characters)', pwWdh: 'Repeat password',
    pwKurz: 'Password: at least 10 characters.', pwUngleich: 'The passwords do not match.',
    anlegen: 'Create access', warten: 'Please wait…',
    fertig: 'Your access is set up and your consent is on record.',
    naechste: 'To get the most out of it: log in, complete your profile (summary, skills, daily rate) and confirm your availability. The dashboard shows a checklist of what is still missing and suggests matching projects.',
    login: 'Log in now',
    hinweisDe: 'The consent text below is provided in German as the legally binding version.',
  },
};

function Stepper({ aktiv, schritte }) {
  return (
    <div style={{ display: 'flex', gap: 6, margin: '14px 0 20px' }}>
      {schritte.map((label, i) => (
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
  const [lang, setLangState] = useState(() => {
    const initial = params.get('lang') === 'en' ? 'en' : (typeof window !== 'undefined' && window.localStorage.getItem('phx-lang')) || 'de';
    try { window.localStorage.setItem('phx-lang', initial); } catch { /* egal */ }
    return initial;
  });
  const setLang = (l) => { try { window.localStorage.setItem('phx-lang', l); } catch { /* egal */ } setLangState(l); };
  const t = TEXTE[lang];
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
    if (password.length < 10) { setMsg(t.pwKurz); return; }
    if (password !== password2) { setMsg(t.pwUngleich); return; }
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
              <div className="msg msg-success">{msg || 'Vielen Dank, deine Einwilligung wurde erneuert.'}</div>
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
        <div style={{ textAlign: 'right', fontSize: 12 }}>
          {['de', 'en'].map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: lang === l ? 700 : 400, color: lang === l ? 'var(--navy)' : 'var(--grey-400, #8a93a0)' }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <h1>{t.titel}</h1>
        <Stepper aktiv={schritt} schritte={t.schritte} />
        {msg && <div className="msg msg-error">{msg}</div>}

        {schritt === 0 && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.55 }}>{t.intro}</p>
            {t.hinweisDe && <p className="muted" style={{ fontSize: 12 }}>{t.hinweisDe}</p>}
            <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 13, background: 'var(--grey-100, #f4f6f8)', padding: 12, borderRadius: 6, margin: '12px 0', whiteSpace: 'pre-wrap' }}>{consentText || 'Laden…'}</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, margin: '10px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              <span>{t.consentLabel}</span>
            </label>
            <button className="btn" disabled={!consent} onClick={() => { setMsg(''); setSchritt(1); }}>{t.weiter}</button>
          </>
        )}

        {schritt === 1 && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.55 }}>{t.pwIntro}</p>
            <div className="field">
              <label>{t.pwLabel}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>{t.pwWdh}</label>
              <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn" style={{ background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}
                onClick={() => setSchritt(0)}>{t.zurueck}</button>
              <button className="btn" disabled={busy} onClick={abschliessen}>{busy ? t.warten : t.anlegen}</button>
            </div>
          </>
        )}

        {schritt === 2 && (
          <>
            <div className="msg msg-success">{t.fertig}</div>
            <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 12 }}>{t.naechste}</p>
            <Link to="/login" className="btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 8 }}>{t.login}</Link>
          </>
        )}
        <LegalFooter />
      </div>
    </div>
  );
}
