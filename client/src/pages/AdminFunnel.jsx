/** v1.7.0 — Funnel: wer steckt in welchem Projektstatus (Pipeline über alle Projekte). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const LABEL = {
  vorgeschlagen: 'Vorgeschlagen', beworben: 'Beworben', im_gespraech: 'Im Gespräch',
  angeboten: 'Angeboten', besetzt: 'Besetzt', abgelehnt: 'Abgelehnt', zurueckgezogen: 'Zurückgezogen',
};
const FARBE = {
  vorgeschlagen: 'var(--grey-400, #8a93a0)', beworben: '#0f5aa8', im_gespraech: '#8a6d00',
  angeboten: '#6a3fa0', besetzt: '#1d7a3e', abgelehnt: '#b23a48', zurueckgezogen: '#8a93a0',
};

export default function AdminFunnel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [projektFilter, setProjektFilter] = useState('alle');

  useEffect(() => {
    api.get('/api/projects/funnel').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Layout><div className="msg msg-error">{error}</div></Layout>;
  if (!data) return <Layout><p className="sub">Laden…</p></Layout>;

  const alleKarten = data.stufen.flatMap((s) => data.funnel[s] || []);
  const projekte = [...new Map(alleKarten.map((k) => [k.project_id, { id: k.project_id, name: k.projekt, referenz: k.referenz }])).values()];
  const zeige = (karten) => karten.filter((k) => projektFilter === 'alle' || String(k.project_id) === String(projektFilter));

  return (
    <Layout>
      <h1><Filter size={22} style={{ verticalAlign: '-3px' }} /> Funnel</h1>
      <p className="sub">Experten je Pipeline-Status über alle offenen Projekte.</p>

      {projekte.length > 1 && (
        <p style={{ margin: '0 0 14px' }}>
          <select value={projektFilter} onChange={(e) => setProjektFilter(e.target.value)} style={{ maxWidth: 340 }}>
            <option value="alle">Alle Projekte</option>
            {projekte.map((p) => <option key={p.id} value={p.id}>{p.referenz ? `${p.referenz} · ` : ''}{p.name}</option>)}
          </select>
        </p>
      )}

      {data.reached && projektFilter === 'alle' && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
          Conversion: {['vorgeschlagen', 'beworben', 'im_gespraech', 'angeboten', 'besetzt']
            .map((s) => `${LABEL[s]} ${data.reached[s] ?? 0}`).join(' → ')}
          {' '}· Stagnation ab {data.stagnant_tage} Tagen ohne Bewegung
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, alignItems: 'start' }}>
        {data.stufen.map((s) => {
          const karten = zeige(data.funnel[s] || []);
          return (
            <div key={s} className="card" style={{ padding: 12 }}>
              <h3 style={{ fontSize: 13, color: FARBE[s], display: 'flex', justifyContent: 'space-between' }}>
                {LABEL[s]} <span>{karten.length}</span>
              </h3>
              {karten.map((k) => (
                <div key={k.id} style={{ borderLeft: `3px solid ${FARBE[s]}`, padding: '6px 8px', margin: '8px 0', background: 'var(--grey-100, #f4f6f8)', borderRadius: 4, fontSize: 13 }}>
                  <Link to={`/admin/experten/${k.expert_id}`}><strong>{k.vorname} {k.nachname}</strong></Link>
                  <div className="muted" style={{ fontSize: 12 }}>
                    <Link to={`/admin/projekte/${k.project_id}`} style={{ color: 'inherit' }}>
                      {k.referenz ? `${k.referenz} · ` : ''}{k.projekt}
                    </Link>
                    {k.matching_score != null && <> · {k.matching_score} %</>}
                    {k.tage_in_stufe != null && (
                      <> · <span style={{ color: k.stagnant ? 'var(--danger, #b23a48)' : 'inherit', fontWeight: k.stagnant ? 700 : 400 }}>
                        {k.tage_in_stufe} T.{k.stagnant ? ' ⚠' : ''}</span></>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                    <select value={k.status} style={{ fontSize: 11, maxWidth: 110 }}
                      onChange={async (ev) => {
                        await api.post(`/api/projects/funnel/${k.id}`, { status: ev.target.value });
                        api.get('/api/projects/funnel').then(setData);
                      }}>
                      {data.stufen.map((st) => <option key={st} value={st}>{LABEL[st]}</option>)}
                    </select>
                    <input type="text" placeholder="Nächster Schritt…" defaultValue={k.next_step || ''}
                      style={{ fontSize: 11, flex: 1, minWidth: 60, border: '1px solid var(--grey-200, #e3e6ea)', borderRadius: 4, padding: '3px 5px' }}
                      onBlur={async (ev) => {
                        if ((k.next_step || '') === ev.target.value) return;
                        await api.post(`/api/projects/funnel/${k.id}`, { next_step: ev.target.value });
                      }} />
                  </div>
                </div>
              ))}
              {!karten.length && <p className="muted" style={{ fontSize: 12 }}>—</p>}
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 17, color: 'var(--navy)', margin: '26px 0 10px' }}>An Kunden freigegeben (Hidden-Link/Vendor)</h2>
      <table className="table">
        <thead><tr><th>Experte</th><th>Projekt</th><th>Freigegeben am</th></tr></thead>
        <tbody>
          {zeige(data.freigegeben_an_kunden.map((r) => ({ ...r, id: `${r.project_id}-${r.expert_id}` }))).map((r) => (
            <tr key={r.id}>
              <td><Link to={`/admin/experten/${r.expert_id}`}>{r.vorname} {r.nachname}</Link>
                <span className="muted"> · {r.berufsbezeichnung}</span></td>
              <td><Link to={`/admin/projekte/${r.project_id}`}>{r.referenz ? `${r.referenz} · ` : ''}{r.projekt}</Link></td>
              <td>{r.created_at ? new Date(r.created_at).toLocaleDateString('de-DE') : '—'}</td>
            </tr>
          ))}
          {!data.freigegeben_an_kunden.length && <tr><td colSpan={3} className="muted">Noch keine Freigaben.</td></tr>}
        </tbody>
      </table>
    </Layout>
  );
}
