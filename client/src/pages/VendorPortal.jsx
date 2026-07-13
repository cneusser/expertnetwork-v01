/** Sprint 8 — Vendor-Portal: eigene Projekte einreichen, kuratierte Profile sehen. */
import { useEffect, useState } from 'react';
import { Briefcase, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const STATUS_LABEL = { eingereicht: 'In Prüfung', entwurf: 'Entwurf', offen: 'Aktiv', besetzt: 'Besetzt', geschlossen: 'Geschlossen' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

export default function VendorPortal() {
  const [projects, setProjects] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ name: '', beschreibung: '', start: '', ende: '', ort: '', arbeitsmodell: 'hybrid', bewerbungsfrist: '', auslastung_prozent: '', remote_anteil: '', tagessatz_von_eur: '', tagessatz_bis_eur: '' });
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/api/vendor/projects').then((d) => setProjects(d.projects)).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const d = await api.post('/api/vendor/projects', {
        name: f.name, beschreibung: f.beschreibung || null, start: f.start || null, ende: f.ende || null,
        ort: f.ort || null, arbeitsmodell: f.arbeitsmodell,
        bewerbungsfrist: f.bewerbungsfrist || null,
        auslastung_prozent: f.auslastung_prozent ? Number(f.auslastung_prozent) : null,
        remote_anteil: f.remote_anteil ? Number(f.remote_anteil) : null,
        tagessatz_von_eur: f.tagessatz_von_eur ? Number(f.tagessatz_von_eur) : null,
        tagessatz_bis_eur: f.tagessatz_bis_eur ? Number(f.tagessatz_bis_eur) : null,
      });
      setMsg({ ok: true, text: d.message });
      setShowForm(false);
      setF({ ...f, name: '', beschreibung: '' });
      load();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  const openDetail = (id) => api.get(`/api/vendor/projects/${id}`).then(setDetail).catch((e) => setMsg({ ok: false, text: e.message }));

  return (
    <Layout>
      <h1><Briefcase size={22} style={{ verticalAlign: '-3px' }} /> Ihre Projekte</h1>
      <p className="sub">Reichen Sie Projekte ein — die Phalanx GmbH prüft sie und stellt Ihnen passende Expertenprofile bereit.</p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <button className="btn" style={{ width: 'auto', marginBottom: 16 }} onClick={() => setShowForm(!showForm)}>
        <Plus size={15} /> Projekt einreichen
      </button>

      {showForm && (
        <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
          <div className="field"><label>Projektname</label>
            <input type="text" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label>Beschreibung / Aufgabenstellung</label>
            <textarea rows={4} value={f.beschreibung} onChange={(e) => setF({ ...f, beschreibung: e.target.value })}
              style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--grey-200)', borderRadius: 6, fontSize: 15, fontFamily: 'inherit' }} /></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field"><label>Start</label><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
            <div className="field"><label>Ende</label><input type="date" value={f.ende} onChange={(e) => setF({ ...f, ende: e.target.value })} /></div>
            <div className="field"><label>Ort</label><input type="text" value={f.ort} onChange={(e) => setF({ ...f, ort: e.target.value })} /></div>
            <div className="field"><label>Arbeitsmodell</label>
              <select value={f.arbeitsmodell} onChange={(e) => setF({ ...f, arbeitsmodell: e.target.value })}>
                <option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="vor_ort">Vor Ort</option>
              </select></div>
            <div className="field"><label>Bewerbungsfrist</label>
              <input type="datetime-local" value={f.bewerbungsfrist} onChange={(e) => setF({ ...f, bewerbungsfrist: e.target.value })} /></div>
            <div className="field"><label>Auslastung (%)</label>
              <input type="number" min="10" max="100" value={f.auslastung_prozent} onChange={(e) => setF({ ...f, auslastung_prozent: e.target.value })} /></div>
            <div className="field"><label>Remote-Anteil (%)</label>
              <input type="number" min="0" max="100" value={f.remote_anteil} onChange={(e) => setF({ ...f, remote_anteil: e.target.value })} /></div>
            <div className="field"><label>Budget-Tagessatz von (€)</label>
              <input type="number" value={f.tagessatz_von_eur} onChange={(e) => setF({ ...f, tagessatz_von_eur: e.target.value })} /></div>
            <div className="field"><label>bis (€)</label>
              <input type="number" value={f.tagessatz_bis_eur} onChange={(e) => setF({ ...f, tagessatz_bis_eur: e.target.value })} /></div>
          </div>
          <button className="btn" style={{ width: 'auto' }}>Einreichen</button>
        </form>
      )}

      {projects && (
        <table className="table">
          <thead><tr><th>Projekt</th><th>Zeitraum</th><th>Status</th><th>Profile für Sie</th><th></th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td>{fmtDate(p.start)} – {fmtDate(p.ende)}</td>
                <td><span className={`status status-${p.status === 'offen' ? 'freigegeben' : 'registriert'}`}>{STATUS_LABEL[p.status] || p.status}</span></td>
                <td>{p.freigaben}</td>
                <td><button className="btn" style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }} onClick={() => openDetail(p.id)}>Profile ansehen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail && (
        <>
          <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '26px 0 10px' }}>
            Vorgeschlagene Profile — {detail.project.name}
          </h2>
          {detail.profiles.length ? (
            <div className="card-grid">
              {detail.profiles.map((p) => (
                <div className="card" key={p.release_id}>
                  <h3>{p.anzeige_name}</h3>
                  <p className="muted">{p.berufsbezeichnung}</p>
                  <p style={{ marginTop: 8 }}>{(p.kurzprofil || '').slice(0, 260)}…</p>
                  <p style={{ marginTop: 8 }}>{p.skills.filter((s) => s.kategorie === 'kompetenz').slice(0, 5).map((s) => <span className="tag" key={s.name}>{s.name}</span>)}</p>
                  <p className="muted" style={{ marginTop: 8 }}>
                    {p.satz || 'Satz auf Anfrage'} · {p.arbeitsmodell || '—'}{p.reisebereitschaft ? ` · ${p.reisebereitschaft}` : ''}
                  </p>
                  {!p.anonymized && (
                    <p className="muted" style={{ marginTop: 6 }}>{p.firma} · {p.email} · {p.mobil}</p>
                  )}
                  {p.anonymized && <span className="badge">Anonymisiertes Profil — Kontakt über Phalanx</span>}
                  <p style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="tab" style={{ color: 'var(--accent)', padding: 0 }}
                      onClick={async () => { /* Favorit braucht expert_id — über release nicht exponiert; Feedback als Hauptaktion */ }} hidden>★</button>
                    {['interessant', 'gespraech_angefragt', 'absage'].map((fb) => (
                      <button type="button" key={fb} className="tab"
                        style={{ padding: '3px 8px', border: '1px solid var(--grey-200)', borderRadius: 6,
                          background: p.feedback === fb ? 'var(--navy)' : 'transparent', color: p.feedback === fb ? '#fff' : 'var(--grey-600)', fontSize: 12.5 }}
                        onClick={async () => {
                          await api.put(`/api/vendor/projects/${detail.project.id}/releases/${p.release_id}`, { feedback: fb });
                          openDetail(detail.project.id);
                        }}>
                        {{ interessant: '★ Interessant', gespraech_angefragt: 'Gespräch anfragen', absage: 'Absage' }[fb]}
                      </button>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          ) : <p className="sub">Noch keine Profile freigegeben — wir arbeiten daran.</p>}
        </>
      )}
    </Layout>
  );
}
