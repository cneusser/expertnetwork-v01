/** Sprint 6 — Offene Projekte für Experten (mit Bewerbung). */
import { useEffect, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');
const APP_LABEL = { vorgeschlagen: 'Von Phalanx vorgeschlagen', beworben: 'Beworben', im_gespraech: 'Im Gespräch', angeboten: 'Angebot erhalten', abgelehnt: 'Nicht berücksichtigt', besetzt: 'Besetzt' };

export default function ExpertProjekte() {
  const [projects, setProjects] = useState(null);
  const [bewerbungen, setBewerbungen] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/api/projects/offen').then((d) => setProjects(d.projects)).catch((e) => setMsg({ ok: false, text: e.message }));
  const loadBew = () => api.get('/api/projects/meine-bewerbungen').then((d) => setBewerbungen(d.bewerbungen)).catch(() => {});
  useEffect(() => { load(); loadBew(); }, []);

  const apply = async (p) => {
    const nachricht = window.prompt(`Bewerbung auf „${p.name}" — kurze Nachricht (optional):`) ?? null;
    if (nachricht === null) return;
    try {
      const d = await api.post(`/api/projects/${p.id}/apply`, { nachricht });
      setMsg({ ok: true, text: d.message });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };

  return (
    <Layout>
      <h1><FolderKanban size={22} style={{ verticalAlign: '-3px' }} /> Offene Projekte</h1>
      <p className="sub">Aktuelle Mandate der Phalanx GmbH — bewerben Sie sich mit einem Klick.</p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
      {!projects ? <p className="sub">Laden…</p> : !projects.length ? (
        <p className="sub">Derzeit keine offenen Projekte — wir melden uns, sobald etwas passt.</p>
      ) : (
        <div className="card-grid">
          {projects.map((p) => (
            <div className="card" key={p.id}>
              <h3>{p.name}</h3>
              <p>{p.beschreibung?.slice(0, 220) || ''}</p>
              <p className="muted" style={{ marginTop: 8 }}>
                {fmtDate(p.start)} – {fmtDate(p.ende)} · {p.ort || 'ortsunabhängig'} · {p.arbeitsmodell}
                {p.auslastung_prozent ? ` · Auslastung ab ${p.auslastung_prozent} %` : ''}
                {p.remote_anteil != null ? ` · Remote ${p.remote_anteil} %` : ''}
              </p>
              {p.bewerbungsfrist && (
                <p className="muted" style={{ marginTop: 4 }}>
                  <strong>Bewerbungsfrist:</strong> {new Date(p.bewerbungsfrist).toLocaleString('de-DE')} Uhr
                  {new Date(p.bewerbungsfrist) < new Date() && <span className="status status-inaktiv" style={{ marginLeft: 6 }}>abgelaufen</span>}
                </p>
              )}
              {p.tagessatz_von_eur && (
                <p className="muted" style={{ marginTop: 4 }}>
                  Tagessatzindikation: {p.tagessatz_von_eur}{p.tagessatz_bis_eur ? `–${p.tagessatz_bis_eur}` : ''} €
                  {p.gebuehr_modell === 'gu_anteil' && p.gebuehr_prozent ? ` (inkl. ${p.gebuehr_prozent} % Phalanx-Anteil)` : ''}
                </p>
              )}
              <p style={{ marginTop: 8 }}>{p.skills.map((s) => <span className="tag" key={s.id}>{s.name}</span>)}</p>
              {p.application || (p.bewerbungsfrist && new Date(p.bewerbungsfrist) < new Date()) ? (
                <span className="badge badge-active" style={{ marginTop: 10 }}>{p.application ? APP_LABEL[p.application.status] : 'Frist abgelaufen'}</span>
              ) : (
                <button className="btn" style={{ width: 'auto', marginTop: 12, padding: '8px 16px' }} onClick={() => apply(p)}>
                  Bewerben
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '30px 0 10px' }}>Meine Bewerbungen</h2>
      {bewerbungen.length ? (
        <table className="table">
          <thead><tr><th>Datum</th><th>Projekt</th><th>Frist</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {bewerbungen.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.created_at).toLocaleDateString('de-DE')}</td>
                <td><strong>{b.name}</strong> <span className="muted">({b.referenz || '—'})</span></td>
                <td>{b.bewerbungsfrist ? new Date(b.bewerbungsfrist).toLocaleString('de-DE') : '—'}</td>
                <td><span className={`status status-${['besetzt'].includes(b.status) ? 'freigegeben' : ['abgelehnt', 'zurueckgezogen'].includes(b.status) ? 'inaktiv' : 'registriert'}`}>
                  {{ vorgeschlagen: 'Vorgeschlagen', beworben: 'Beworben', im_gespraech: 'Im Gespräch', angeboten: 'Angebot erhalten', abgelehnt: 'Absage', besetzt: 'Gewonnen', zurueckgezogen: 'Eigene Absage' }[b.status] || b.status}
                </span></td>
                <td>{!['besetzt', 'abgelehnt', 'zurueckgezogen'].includes(b.status) && (
                  <button type="button" className="tab" style={{ padding: 0, color: 'var(--danger)' }}
                    onClick={async () => {
                      if (!window.confirm('Bewerbung wirklich zurückziehen?')) return;
                      await api.post(`/api/projects/bewerbungen/${b.id}/zurueckziehen`);
                      loadBew();
                    }}>Zurückziehen</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="sub">Noch keine Bewerbungen.</p>}
    </Layout>
  );
}
