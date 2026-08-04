/** v1.19.0 — Skill-Taxonomie pflegen: freigeben, umbenennen, zusammenführen, löschen. */
import { useEffect, useState } from 'react';
import { Tags } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

export default function AdminSkills() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('alle');
  const [suche, setSuche] = useState('');
  const [mergeVon, setMergeVon] = useState(null);

  const load = () => api.get('/api/skills').then(setData).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);
  if (!data) return <Layout><p className="sub">Laden…</p></Layout>;

  const offen = data.skills.filter((s) => !s.is_approved).length;
  const liste = data.skills
    .filter((s) => (filter === 'alle' ? true : filter === 'vorschlaege' ? !s.is_approved : s.kategorie === filter))
    .filter((s) => !suche || s.name.toLowerCase().includes(suche.toLowerCase()));

  return (
    <Layout>
      <h1><Tags size={22} style={{ verticalAlign: '-3px' }} /> Skills</h1>
      <p className="sub">{data.skills.length} Begriffe im Katalog, davon {offen} Vorschläge zur Freigabe.</p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 14px' }}>
        {offen > 0 && (
          <button type="button" className="btn" style={{ width: 'auto' }}
            onClick={async () => {
              if (!window.confirm(`Alle ${offen} Vorschläge freigeben?`)) return;
              const d = await api.post('/api/skills/freigeben-alle');
              setMsg({ ok: true, text: d.message }); load();
            }}>Alle {offen} Vorschläge freigeben</button>
        )}
        {['alle', 'vorschlaege', ...data.kategorien].map((k) => (
          <button key={k} type="button" className="tag"
            style={{ cursor: 'pointer', border: 'none', background: filter === k ? 'var(--navy)' : undefined, color: filter === k ? '#fff' : undefined }}
            onClick={() => setFilter(k)}>{k === 'alle' ? 'Alle' : k === 'vorschlaege' ? `Vorschläge (${offen})` : k}</button>
        ))}
        <input type="text" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen…"
          style={{ marginLeft: 'auto', maxWidth: 200, border: '1px solid var(--grey-200)', borderRadius: 6, padding: '7px 10px', fontSize: 14 }} />
      </p>

      {mergeVon && (
        <div className="notice" style={{ marginBottom: 12 }}>
          <strong>„{mergeVon.name}" zusammenführen:</strong> Zielbegriff in der Liste anklicken. Alle Zuordnungen wandern mit, „{mergeVon.name}" verschwindet.{' '}
          <button type="button" className="tab" style={{ padding: 0, color: 'var(--danger)' }} onClick={() => setMergeVon(null)}>Abbrechen</button>
        </div>
      )}

      <table className="table">
        <thead><tr><th>Begriff</th><th>Kategorie</th><th>Verwendungen</th><th>Status</th><th /></tr></thead>
        <tbody>
          {liste.map((s) => (
            <tr key={s.id} style={mergeVon && mergeVon.id !== s.id ? { cursor: 'pointer', background: 'var(--grey-100, #f4f6f8)' } : undefined}
              onClick={async () => {
                if (!mergeVon || mergeVon.id === s.id) return;
                if (!window.confirm(`„${mergeVon.name}" in „${s.name}" zusammenführen?`)) return;
                const d = await api.post(`/api/skills/${mergeVon.id}/merge`, { ziel_id: s.id });
                setMsg({ ok: true, text: d.message }); setMergeVon(null); load();
              }}>
              <td><strong>{s.name}</strong></td>
              <td>
                <select value={s.kategorie} style={{ fontSize: 12 }} onClick={(e) => e.stopPropagation()}
                  onChange={async (e) => { await api.put(`/api/skills/${s.id}`, { kategorie: e.target.value }); load(); }}>
                  {data.kategorien.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </td>
              <td>{s.verwendungen}</td>
              <td>{s.is_approved
                ? <span className="status status-freigegeben">Freigegeben</span>
                : <span className="status status-eingeladen">Vorschlag</span>}</td>
              <td onClick={(e) => e.stopPropagation()} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {!s.is_approved && (
                  <button type="button" className="tab" style={{ padding: 0, marginRight: 10, color: 'var(--navy)' }}
                    onClick={async () => { await api.put(`/api/skills/${s.id}`, { is_approved: true }); load(); }}>Freigeben</button>
                )}
                <button type="button" className="tab" style={{ padding: 0, marginRight: 10 }}
                  onClick={async () => {
                    const name = window.prompt('Neuer Name:', s.name);
                    if (!name || name === s.name) return;
                    try { await api.put(`/api/skills/${s.id}`, { name }); load(); }
                    catch (err) { setMsg({ ok: false, text: err.message }); }
                  }}>Umbenennen</button>
                <button type="button" className="tab" style={{ padding: 0, marginRight: 10 }}
                  onClick={() => setMergeVon(s)}>Zusammenführen</button>
                <button type="button" className="tab" style={{ padding: 0, color: 'var(--danger)' }}
                  onClick={async () => {
                    if (!window.confirm(`„${s.name}" löschen? Der Begriff verschwindet bei ${s.verwendungen} Profil(en).`)) return;
                    await api.del(`/api/skills/${s.id}`); load();
                  }}>Löschen</button>
              </td>
            </tr>
          ))}
          {!liste.length && <tr><td colSpan={5} className="muted">Keine Treffer.</td></tr>}
        </tbody>
      </table>
    </Layout>
  );
}
