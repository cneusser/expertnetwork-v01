/** v1.2.0 — Öffentliche Projektseite mit Bewerbung ohne Konto (Piquano-Muster). */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';
import { api } from '../api/client';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

export default function ProjektOeffentlich() {
  const { referenz } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ vorname: '', nachname: '', email: '', tagessatz: '', verfuegbar_ab: '', referenzprojekte: '', nachricht: '', consent: false });
  const [cv, setCv] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/api/public/projects/${referenz}`).then((d) => setP(d.project)).catch((e) => setError(e.message));
  }, [referenz]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      if (cv) fd.append('cv', cv);
      const d = await api.upload(`/api/public/projects/${referenz}/apply`, fd);
      setMsg({ ok: true, text: d.message });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="auth-wrap"><div className="auth-card"><Logo /><div className="msg msg-error" style={{ marginTop: 16 }}>{error}</div></div></div>;
  if (!p) return <div className="auth-wrap"><div className="auth-card"><Logo /><p className="sub" style={{ marginTop: 16 }}>Laden…</p></div></div>;
  const fristAbgelaufen = p.bewerbungsfrist && new Date(p.bewerbungsfrist) < new Date();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <Logo />
      <h1 style={{ color: 'var(--navy)', margin: '20px 0 6px', fontSize: 28 }}>{p.name}</h1>
      <p className="muted">
        {p.ort || 'ortsunabhängig'} · {p.arbeitsmodell}{p.remote_anteil != null ? ` (Remote ${p.remote_anteil} %)` : ''} · Referenz {p.referenz}
      </p>
      <div className="detail-grid" style={{ margin: '20px 0' }}>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Projektbeschreibung</h3>
          <p style={{ whiteSpace: 'pre-line' }}>{p.beschreibung || '—'}</p>
          <p style={{ marginTop: 10 }}>{(p.skills || []).map((s) => <span className="tag" key={s}>{s}</span>)}</p>
        </div>
        <div className="card">
          <h3>Projekt-Details</h3>
          <p>
            Start: {fmtDate(p.start)}<br />Ende: {fmtDate(p.ende)}<br />
            {p.auslastung_prozent ? <>Auslastung: ab {p.auslastung_prozent} %<br /></> : null}
            {p.bewerbungsfrist ? <><strong>Bewerbungsfrist:</strong> {new Date(p.bewerbungsfrist).toLocaleString('de-DE')} Uhr<br /></> : null}
            {p.tagessatz_von_eur ? <>Tagessatzindikation: {p.tagessatz_von_eur}{p.tagessatz_bis_eur ? `–${p.tagessatz_bis_eur}` : ''} €
              {p.gebuehr_modell === 'gu_anteil' && p.gebuehr_prozent ? ` (inkl. ${p.gebuehr_prozent} % Phalanx-Anteil)` : ''}</> : null}
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Jetzt bewerben — ohne Registrierung</h3>
        {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
        {fristAbgelaufen ? <p className="sub" style={{ marginTop: 8 }}>Die Bewerbungsfrist ist abgelaufen.</p> : !msg?.ok && (
          <form onSubmit={submit} style={{ marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0 14px' }}>
              <div className="field"><label>Vorname *</label><input required value={f.vorname} onChange={(e) => setF({ ...f, vorname: e.target.value })} /></div>
              <div className="field"><label>Nachname *</label><input required value={f.nachname} onChange={(e) => setF({ ...f, nachname: e.target.value })} /></div>
              <div className="field"><label>E-Mail *</label><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div className="field"><label>Ihr Tagessatz (€)</label><input type="number" value={f.tagessatz} onChange={(e) => setF({ ...f, tagessatz: e.target.value })} /></div>
              <div className="field"><label>Verfügbar ab</label><input type="date" value={f.verfuegbar_ab} onChange={(e) => setF({ ...f, verfuegbar_ab: e.target.value })} /></div>
            </div>
            <div className="field">
              <label>Referenzprojekte (mind. 2, relevant für diese Anfrage)</label>
              <textarea rows={4} value={f.referenzprojekte} onChange={(e) => setF({ ...f, referenzprojekte: e.target.value })}
                placeholder="Kunde/Branche, Zeitraum, Ihre Rolle, konkrete Ergebnisse …"
                style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--grey-200)', borderRadius: 6, fontSize: 15, fontFamily: 'inherit' }} />
            </div>
            <div className="field"><label>Lebenslauf (PDF, max. 10 MB)</label>
              <input type="file" accept="application/pdf" onChange={(e) => setCv(e.target.files[0])} /></div>
            <label className="consent-check">
              <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} required />
              <span>Ich habe die AGB und die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu. *</span>
            </label>
            <button className="btn" style={{ width: 'auto' }} disabled={busy || !f.consent}>{busy ? 'Senden…' : 'Bewerbung absenden'}</button>
          </form>
        )}
      </div>
      <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>Phalanx GmbH · Erlangen · neusser@phalanx.de</p>
      <LegalFooter />
    </div>
  );
}
