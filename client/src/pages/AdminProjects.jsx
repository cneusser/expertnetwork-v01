/** Sprint 6 — Projektliste + Anlage (Admin). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const STATUS_LABEL = { entwurf: 'Entwurf', offen: 'Offen', besetzt: 'Besetzt', geschlossen: 'Geschlossen' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

export default function AdminProjects() {
  const [projects, setProjects] = useState(null);
  const [meta, setMeta] = useState({ skills: [] });
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ name: '', beschreibung: '', tagessatz_bis_eur: '', start: '', ende: '', ort: '', arbeitsmodell: 'hybrid', status: 'offen', skill_ids: [] });
  const [error, setError] = useState('');

  const load = () => api.get('/api/projects').then((d) => setProjects(d.projects)).catch((e) => setError(e.message));
  useEffect(() => { load(); api.get('/api/search/meta').then(setMeta).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/projects', {
        ...f,
        tagessatz_bis_eur: f.tagessatz_bis_eur ? Number(f.tagessatz_bis_eur) : null,
        start: f.start || null,
        ende: f.ende || null,
        beschreibung: f.beschreibung || null,
        ort: f.ort || null,
      });
      setShowForm(false);
      setF({ ...f, name: '', beschreibung: '', skill_ids: [] });
      load();
    } catch (err) { setError(err.message); }
  };

  return (
    <Layout>
      <h1><FolderKanban size={22} style={{ verticalAlign: '-3px' }} /> Projekte</h1>
      <p className="sub">Interne Projekte mit automatischen Matching-Vorschlägen.</p>
      {error && <div className="msg msg-error">{error}</div>}
      <button className="btn" style={{ width: 'auto', marginBottom: 16 }} onClick={() => setShowForm(!showForm)}>
        <Plus size={15} /> Neues Projekt
      </button>

      {showForm && (
        <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 16px' }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Projektname</label>
              <input type="text" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Beschreibung</label>
              <textarea rows={3} value={f.beschreibung} onChange={(e) => setF({ ...f, beschreibung: e.target.value })}
                style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--grey-200)', borderRadius: 6, fontSize: 15, fontFamily: 'inherit' }} />
            </div>
            <div className="field"><label>Tagessatz bis (€)</label>
              <input type="number" value={f.tagessatz_bis_eur} onChange={(e) => setF({ ...f, tagessatz_bis_eur: e.target.value })} /></div>
            <div className="field"><label>Start</label>
              <input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
            <div className="field"><label>Ende</label>
              <input type="date" value={f.ende} onChange={(e) => setF({ ...f, ende: e.target.value })} /></div>
            <div className="field"><label>Ort</label>
              <input type="text" value={f.ort} onChange={(e) => setF({ ...f, ort: e.target.value })} /></div>
            <div className="field"><label>Arbeitsmodell</label>
              <select value={f.arbeitsmodell} onChange={(e) => setF({ ...f, arbeitsmodell: e.target.value })}>
                <option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="vor_ort">Vor Ort</option>
              </select></div>
            <div className="field"><label>Status</label>
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          <div className="field">
            <label>Benötigte Skills</label>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--grey-200)', borderRadius: 6, padding: 10 }}>
              {meta.skills.map((s) => (
                <label key={s.id} style={{ display: 'inline-flex', gap: 5, marginRight: 14, fontSize: 13 }}>
                  <input type="checkbox" checked={f.skill_ids.includes(s.id)}
                    onChange={() => setF({ ...f, skill_ids: f.skill_ids.includes(s.id) ? f.skill_ids.filter((x) => x !== s.id) : [...f.skill_ids, s.id] })} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn" style={{ width: 'auto' }}>Projekt anlegen</button>
        </form>
      )}

      {projects && (
        <table className="table">
          <thead><tr><th>Projekt</th><th>Zeitraum</th><th>Ort</th><th>Satz bis</th><th>Pipeline</th><th>Status</th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/admin/projekte/${p.id}`}><strong>{p.name}</strong></Link></td>
                <td>{fmtDate(p.start)} – {fmtDate(p.ende)}</td>
                <td>{p.ort || '—'}</td>
                <td>{p.tagessatz_bis_eur ? `${p.tagessatz_bis_eur} €` : '—'}</td>
                <td>{p.bewerbungen} Kandidat(en)</td>
                <td><span className={`status status-${p.status === 'offen' ? 'freigegeben' : 'registriert'}`}>{STATUS_LABEL[p.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
