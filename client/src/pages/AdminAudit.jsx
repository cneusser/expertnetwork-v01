/** Globales Audit-Log (Admin) mit Filtern und CSV-Export. */
import { useEffect, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import Layout from '../components/Layout';
import AuditTable from '../components/AuditTable';
import { api } from '../api/client';

const RESOURCES = ['', 'experts', 'users', 'consents', 'rates', 'documents', 'availabilities', 'http'];

export default function AdminAudit() {
  const [filter, setFilter] = useState({ resource: '', action: '', from: '', to: '' });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const qs = () => new URLSearchParams(Object.fromEntries(Object.entries(filter).filter(([, v]) => v))).toString();
  const load = () => api.get(`/api/audit?${qs()}`).then((d) => setRows(d.rows)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <h1><ScrollText size={22} style={{ verticalAlign: '-3px' }} /> Audit-Log</h1>
      <p className="sub">Append-only Änderungsprotokoll — auch für Administratoren unveränderbar.</p>
      {error && <div className="msg msg-error">{error}</div>}
      <form className="card" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Ressource</label>
            <select value={filter.resource} onChange={(e) => setFilter({ ...filter, resource: e.target.value })}>
              {RESOURCES.map((r) => <option key={r} value={r}>{r || 'Alle'}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Aktion enthält</label>
            <input type="text" value={filter.action} onChange={(e) => setFilter({ ...filter, action: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Von</label>
            <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Bis</label>
            <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
          </div>
          <button className="btn" style={{ width: 'auto' }}>Filtern</button>
          <a href={`/api/audit/export.csv?${qs()}`} className="btn" style={{ width: 'auto', textDecoration: 'none' }}>
            <Download size={14} /> CSV
          </a>
        </div>
      </form>
      {rows ? <AuditTable rows={rows} /> : <p className="sub">Laden…</p>}
    </Layout>
  );
}
