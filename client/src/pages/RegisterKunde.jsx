/** v1.1.0 — Kunden-Selbstregistrierung (Firmenprofil + Ansprechpartner, Admin-Freigabe). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';

export default function RegisterKunde() {
  const [f, setF] = useState({
    firmenname: '', branche: '', telefon: '', strasse: '', plz: '', ort: '',
    anrede: 'herr', titel: '', vorname: '', nachname: '', position: '',
    email: '', password: '', consent: false,
  });
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const d = await api.post('/api/auth/register-kunde', {
        firmenname: f.firmenname, branche: f.branche || null, telefon: f.telefon || null,
        adresse: { strasse: f.strasse, plz: f.plz, ort: f.ort },
        ansprechpartner: { anrede: f.anrede, titel: f.titel || null, vorname: f.vorname, nachname: f.nachname, position: f.position || null },
        email: f.email, password: f.password, consent: f.consent,
      });
      setDone(true);
      setMsg({ ok: true, text: d.message });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const field = (label, k, type = 'text', required = true) => (
    <div className="field">
      <label>{label}</label>
      <input type={type} required={required} value={f[k]} onChange={set(k)} minLength={type === 'password' ? 10 : undefined} />
    </div>
  );

  return (
    <div className="auth-wrap">
      <form className="auth-card" style={{ maxWidth: 620 }} onSubmit={submit}>
        <Logo />
        <h1>Als Kunde registrieren</h1>
        <p className="sub">Projekte ausschreiben und kuratierte Expertenprofile erhalten — Freigabe durch die Phalanx GmbH.</p>
        {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
        {!done && (
          <>
            <h3 style={{ margin: '6px 0 10px', color: 'var(--navy)' }}>Firmenprofil</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              {field('Firmenname *', 'firmenname')}
              {field('Branche', 'branche', 'text', false)}
              {field('Telefon', 'telefon', 'text', false)}
              {field('Straße und Hausnummer', 'strasse', 'text', false)}
              {field('PLZ', 'plz', 'text', false)}
              {field('Ort', 'ort', 'text', false)}
            </div>
            <h3 style={{ margin: '6px 0 10px', color: 'var(--navy)' }}>Ansprechpartner</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <div className="field">
                <label>Anrede *</label>
                <select value={f.anrede} onChange={set('anrede')}>
                  <option value="herr">Herr</option><option value="frau">Frau</option><option value="divers">Divers</option>
                </select>
              </div>
              {field('Titel', 'titel', 'text', false)}
              {field('Vorname *', 'vorname')}
              {field('Nachname *', 'nachname')}
              {field('Position', 'position', 'text', false)}
              {field('E-Mail *', 'email', 'email')}
              {field('Passwort (mind. 10 Zeichen) *', 'password', 'password')}
            </div>
            <label className="consent-check">
              <input type="checkbox" checked={f.consent} onChange={set('consent')} required />
              <span>Ich habe die AGB und die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu (Art. 13 DSGVO).</span>
            </label>
            <button className="btn" disabled={busy || !f.consent}>{busy ? 'Registrieren…' : 'Registrieren'}</button>
          </>
        )}
        <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
      </form>
      <LegalFooter />
    </div>
  );
}
