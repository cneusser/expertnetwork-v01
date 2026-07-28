/** v1.11.0 — Partneranfragen sichten und triagieren (neu → in Prüfung → angenommen/abgelehnt). */
import { useEffect, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const STATUS = { neu: 'Neu', in_pruefung: 'In Prüfung', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt' };
const BADGE = { neu: 'eingeladen', in_pruefung: 'registriert', angenommen: 'freigegeben', abgelehnt: 'inaktiv' };

export default function AdminPartner() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/api/partner/bewerbungen').then((d) => setRows(d.bewerbungen)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <h1><HeartHandshake size={22} style={{ verticalAlign: '-3px' }} /> Partner</h1>
      <p className="sub">Anfragen für die assoziierte Partnerschaft (Recruiting, Projektakquise, Delivery).</p>
      {error && <div className="msg msg-error">{error}</div>}
      {rows && (
        <table className="table">
          <thead><tr><th>Datum</th><th>Name</th><th>Kontakt</th><th>Interesse</th><th>Nachricht</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const fokus = typeof r.fokus_json === 'string' ? JSON.parse(r.fokus_json || '[]') : (r.fokus_json || []);
              return (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleDateString('de-DE')}</td>
                  <td><strong>{r.vorname} {r.nachname}</strong></td>
                  <td>{r.email}{r.telefon && <><br /><span className="muted">{r.telefon}</span></>}</td>
                  <td>{fokus.map((f) => <span className="tag" key={f}>{{ recruiting: 'Recruiting', akquise: 'Akquise', delivery: 'Delivery' }[f] || f}</span>)}</td>
                  <td style={{ maxWidth: 280, fontSize: 13 }}>{r.nachricht || '—'}</td>
                  <td>
                    <span className={`status status-${BADGE[r.status]}`}>{STATUS[r.status]}</span><br />
                    <select value={r.status} style={{ marginTop: 6, fontSize: 12 }}
                      onChange={async (e) => { await api.post(`/api/partner/bewerbungen/${r.id}/status`, { status: e.target.value }); load(); }}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="muted">Noch keine Anfragen. Die öffentliche Seite ist unter /partner erreichbar.</td></tr>}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
