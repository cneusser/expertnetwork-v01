/** Sprint 6 — Offene Projekte für Experten (mit Bewerbung). */
import { useEffect, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');
const APP_LABEL = { vorgeschlagen: 'Von Phalanx vorgeschlagen', beworben: 'Beworben', im_gespraech: 'Im Gespräch', angeboten: 'Angebot erhalten', abgelehnt: 'Nicht berücksichtigt', besetzt: 'Besetzt' };

export default function ExpertProjekte() {
  const [projects, setProjects] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/api/projects/offen').then((d) => setProjects(d.projects)).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);

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
              </p>
              <p style={{ marginTop: 8 }}>{p.skills.map((s) => <span className="tag" key={s.id}>{s.name}</span>)}</p>
              {p.application ? (
                <span className="badge badge-active" style={{ marginTop: 10 }}>{APP_LABEL[p.application.status]}</span>
              ) : (
                <button className="btn" style={{ width: 'auto', marginTop: 12, padding: '8px 16px' }} onClick={() => apply(p)}>
                  Bewerben
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
