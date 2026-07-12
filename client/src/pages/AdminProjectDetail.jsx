/** Sprint 6 — Projekt-Detail: Matching-Vorschläge + Bewerbungs-Pipeline (Admin). */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const APP_STATUS = ['vorgeschlagen', 'beworben', 'im_gespraech', 'angeboten', 'abgelehnt', 'besetzt'];
const STATUS_LABEL = { entwurf: 'Entwurf', offen: 'Offen', besetzt: 'Besetzt', geschlossen: 'Geschlossen' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

export default function AdminProjectDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get(`/api/projects/${id}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  if (error) return <Layout><div className="msg msg-error">{error}</div></Layout>;
  if (!data) return <Layout><p className="sub">Laden…</p></Layout>;
  const { project, skills, applications, matches } = data;

  return (
    <Layout>
      <p><Link to="/admin/projekte"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Zurück zu Projekten</Link></p>
      <h1>{project.name}</h1>
      <p className="sub">
        {fmtDate(project.start)} – {fmtDate(project.ende)} · {project.ort || 'ortsunabhängig'} · {project.arbeitsmodell}
        {project.tagessatz_bis_eur ? ` · Satz bis ${project.tagessatz_bis_eur} €` : ''}
        {' · Status: '}
        <select value={project.status} style={{ fontSize: 13 }}
          onChange={async (e) => { await api.put(`/api/projects/${id}`, { status: e.target.value }); load(); }}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </p>
      {project.beschreibung && <div className="card" style={{ marginBottom: 14 }}><p>{project.beschreibung}</p></div>}
      <p style={{ marginBottom: 20 }}>{skills.map((s) => <span className="tag" key={s.id}>{s.name}</span>)}</p>

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '18px 0 10px' }}>Pipeline ({applications.length})</h2>
      {applications.length ? (
        <table className="table">
          <thead><tr><th>Kandidat</th><th>Match</th><th>Begründung</th><th>Nachricht</th><th>Status</th></tr></thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/admin/experten/${a.expert_id}`}><strong>{a.vorname} {a.nachname}</strong></Link><br />
                  <span className="muted">{a.berufsbezeichnung?.split('—')[0]}</span></td>
                <td><strong>{a.matching_score ?? '—'} %</strong></td>
                <td style={{ fontSize: 12.5, maxWidth: 320 }}>{a.begruendung}</td>
                <td style={{ fontSize: 12.5, maxWidth: 200 }}>{a.nachricht || '—'}</td>
                <td>
                  <select value={a.status}
                    onChange={async (e) => { await api.put(`/api/projects/${id}/applications/${a.id}`, { status: e.target.value }); load(); }}>
                    {APP_STATUS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="sub">Noch keine Kandidaten in der Pipeline.</p>}

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '26px 0 10px' }}>Matching-Vorschläge</h2>
      {matches.length ? (
        <table className="table">
          <thead><tr><th>Experte</th><th>Match</th><th>Aufschlüsselung</th><th>Begründung</th><th></th></tr></thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.expert.id}>
                <td><Link to={`/admin/experten/${m.expert.id}`}><strong>{m.expert.vorname} {m.expert.nachname}</strong></Link><br />
                  <span className="muted">{m.expert.berufsbezeichnung?.split('—')[0]}</span></td>
                <td><strong style={{ fontSize: 18, color: m.score >= 70 ? 'var(--success)' : m.score >= 40 ? '#d99b1f' : 'var(--danger)' }}>{m.score} %</strong></td>
                <td style={{ fontSize: 12.5 }}>
                  Skills {m.breakdown.skills} · Verfügbarkeit {m.breakdown.verfuegbarkeit} · Satz {m.breakdown.satz} · Frische {m.breakdown.frische}
                </td>
                <td style={{ fontSize: 12.5, maxWidth: 320 }}>{m.begruendung}</td>
                <td><button className="btn" style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}
                  onClick={async () => { await api.post(`/api/projects/${id}/applications`, { expert_id: m.expert.id }); load(); }}>
                  In Pipeline aufnehmen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="sub">Keine weiteren Kandidaten.</p>}
    </Layout>
  );
}
