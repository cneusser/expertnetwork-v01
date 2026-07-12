/** Sprint 7 — Kommunikation (Admin): Einzel-/Serienmail, Terminanfrage, Historie. */
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Mail, Send } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const fmtTs = (t) => (t ? new Date(t).toLocaleString('de-DE') : '—');

export default function AdminKommunikation() {
  const [params] = useSearchParams();
  const preselect = (params.get('ids') || '').split(',').filter(Boolean).map(Number);
  const [experts, setExperts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [rows, setRows] = useState(null);
  const [teamsLink, setTeamsLink] = useState('');
  const [f, setF] = useState({
    expert_ids: preselect,
    typ: preselect.length === 1 ? 'einzelmail' : 'serienmail',
    betreff: '',
    body: '{briefanrede},\n\n',
    projekt_id: '',
    slots: ['', '', ''],
  });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadRows = () => api.get('/api/communications').then((d) => setRows(d.rows)).catch(() => setRows([]));
  useEffect(() => {
    api.get('/api/experts').then((d) => setExperts(d.experts)).catch(() => {});
    api.get('/api/projects').then((d) => setProjects(d.projects)).catch(() => {});
    api.get('/api/communications/settings').then((d) => setTeamsLink(d.teams_link)).catch(() => {});
    loadRows();
  }, []);

  const toggle = (id) => setF({ ...f, expert_ids: f.expert_ids.includes(id) ? f.expert_ids.filter((x) => x !== id) : [...f.expert_ids, id] });

  const send = async (e) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const d = await api.post('/api/communications/send', {
        expert_ids: f.expert_ids,
        typ: f.typ,
        betreff: f.betreff,
        body: f.body,
        projekt_id: f.projekt_id ? Number(f.projekt_id) : null,
        slots: f.typ === 'terminanfrage' ? f.slots.filter(Boolean) : undefined,
      });
      setMsg({ ok: d.fehlgeschlagen === 0, text: `${d.gesendet} gesendet${d.fehlgeschlagen ? `, ${d.fehlgeschlagen} fehlgeschlagen` : ''}.` });
      loadRows();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <h1><Mail size={22} style={{ verticalAlign: '-3px' }} /> Kommunikation</h1>
      <p className="sub">Platzhalter: <code>{'{briefanrede} {vorname} {nachname} {firma} {projekt}'}</code></p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <form className="card" style={{ marginBottom: 18 }} onSubmit={send}>
        <div className="field">
          <label>Empfänger ({f.expert_ids.length} ausgewählt)</label>
          <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--grey-200)', borderRadius: 6, padding: 10 }}>
            {experts.map((e) => (
              <label key={e.id} style={{ display: 'inline-flex', gap: 5, marginRight: 16, fontSize: 13.5 }}>
                <input type="checkbox" checked={f.expert_ids.includes(e.id)} onChange={() => toggle(e.id)} />
                {e.vorname} {e.nachname}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 170 }}>
            <label>Typ</label>
            <select value={f.typ} onChange={(e) => setF({ ...f, typ: e.target.value })}>
              <option value="einzelmail">Einzelmail</option>
              <option value="serienmail">Serienmail</option>
              <option value="terminanfrage">Terminanfrage</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Projekt (für {'{projekt}'})</label>
            <select value={f.projekt_id} onChange={(e) => setF({ ...f, projekt_id: e.target.value })}>
              <option value="">—</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label>Betreff</label>
            <input type="text" required value={f.betreff} onChange={(e) => setF({ ...f, betreff: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Nachricht</label>
          <textarea rows={7} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })}
            style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--grey-200)', borderRadius: 6, fontSize: 15, fontFamily: 'inherit' }} />
        </div>
        {f.typ === 'terminanfrage' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {f.slots.map((s, i) => (
              <div className="field" key={i} style={{ minWidth: 200 }}>
                <label>Terminvorschlag {i + 1}</label>
                <input type="text" placeholder="z. B. Di 21.07., 10:00 Uhr" value={s}
                  onChange={(e) => setF({ ...f, slots: f.slots.map((x, j) => (j === i ? e.target.value : x)) })} />
              </div>
            ))}
            <div className="field" style={{ flex: '1 1 260px' }}>
              <label>Teams-Link (wird gespeichert)</label>
              <input type="text" value={teamsLink} onChange={(e) => setTeamsLink(e.target.value)}
                onBlur={() => api.put('/api/communications/settings', { teams_link: teamsLink }).catch(() => {})} />
            </div>
          </div>
        )}
        <button className="btn" style={{ width: 'auto' }} disabled={busy || !f.expert_ids.length}>
          <Send size={14} /> {busy ? 'Senden…' : `An ${f.expert_ids.length} Empfänger senden`}
        </button>
      </form>

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '0 0 10px' }}>Kommunikationshistorie</h2>
      {rows ? (
        <table className="table">
          <thead><tr><th>Zeitpunkt</th><th>Empfänger</th><th>Typ</th><th>Betreff</th><th>Projekt</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const ex = experts.find((e) => e.id === r.expert_id);
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtTs(r.sent_at)}</td>
                  <td>{ex ? <Link to={`/admin/experten/${ex.id}`}>{ex.vorname} {ex.nachname}</Link> : `#${r.expert_id}`}</td>
                  <td>{r.typ}</td>
                  <td>{r.betreff}</td>
                  <td>{r.projekt_name || '—'}</td>
                  <td><span className={`status status-${r.status === 'gesendet' ? 'freigegeben' : 'inaktiv'}`}>{r.status}</span>
                    {r.fehler && <div className="muted">{r.fehler}</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="sub">Laden…</p>}
    </Layout>
  );
}
