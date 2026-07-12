/** Sprint 8 — Mandanten (Plattform-Admin) + Kunden-Konten (Vendor) verwalten. */
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

export default function AdminMandanten() {
  const [tenants, setTenants] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [t, setT] = useState({ slug: '', name: '', owner_email: '', owner_password: '' });
  const [v, setV] = useState({ email: '', password: '', firma: '' });
  const [msg, setMsg] = useState(null);

  const load = () => {
    api.get('/api/tenants').then((d) => setTenants(d.tenants)).catch(() => setTenants([]));
    api.get('/api/tenants/vendors').then((d) => setVendors(d.vendors)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const createTenant = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/tenants', t);
      setMsg({ ok: true, text: `Mandant „${t.name}" angelegt.` });
      setT({ slug: '', name: '', owner_email: '', owner_password: '' });
      load();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  const createVendor = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/tenants/vendors', v);
      setMsg({ ok: true, text: `Kunden-Zugang ${v.email} angelegt.` });
      setV({ email: '', password: '', firma: '' });
      load();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  return (
    <Layout>
      <h1><Building2 size={22} style={{ verticalAlign: '-3px' }} /> Mandanten &amp; Kunden</h1>
      <p className="sub">Multi-Tenant-Verwaltung (Mandanten) und Vendor-Zugänge für das Kundenportal.</p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <div className="detail-grid">
        <div className="card">
          <h3>Kunden-Zugänge (Vendor-Portal)</h3>
          {vendors.length ? (
            <p style={{ margin: '10px 0' }}>{vendors.map((x) => <span className="tag" key={x.id}>{x.email}</span>)}</p>
          ) : <p className="muted" style={{ margin: '10px 0' }}>Noch keine Kunden-Zugänge.</p>}
          <form onSubmit={createVendor}>
            <div className="field"><label>E-Mail</label>
              <input type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
            <div className="field"><label>Firma (optional)</label>
              <input type="text" value={v.firma} onChange={(e) => setV({ ...v, firma: e.target.value })} /></div>
            <div className="field"><label>Start-Passwort (mind. 10 Zeichen)</label>
              <input type="text" required minLength={10} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></div>
            <button className="btn" style={{ width: 'auto' }}>Kunden-Zugang anlegen</button>
          </form>
        </div>

        <div className="card">
          <h3>Mandanten</h3>
          {tenants === null ? <p className="muted">Laden…</p> : (
            <table className="table" style={{ margin: '10px 0' }}>
              <thead><tr><th>Mandant</th><th>Nutzer</th><th>Experten</th></tr></thead>
              <tbody>
                {tenants.map((x) => (
                  <tr key={x.id}><td><strong>{x.name}</strong> <span className="muted">({x.slug})</span></td><td>{x.users}</td><td>{x.experts}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <form onSubmit={createTenant}>
            <div className="field"><label>Slug (z. B. beispiel-gmbh)</label>
              <input type="text" required value={t.slug} onChange={(e) => setT({ ...t, slug: e.target.value })} /></div>
            <div className="field"><label>Name</label>
              <input type="text" required value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></div>
            <div className="field"><label>Owner-E-Mail</label>
              <input type="email" required value={t.owner_email} onChange={(e) => setT({ ...t, owner_email: e.target.value })} /></div>
            <div className="field"><label>Owner-Passwort (mind. 10 Zeichen)</label>
              <input type="text" required minLength={10} value={t.owner_password} onChange={(e) => setT({ ...t, owner_password: e.target.value })} /></div>
            <button className="btn" style={{ width: 'auto' }}>Mandant anlegen</button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
