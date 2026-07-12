/** Mein Konto (alle Rollen): E-Mail + Passwort ändern, eigene Änderungshistorie. */
import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import Layout from '../components/Layout';
import AuditTable from '../components/AuditTable';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Konto() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get('/api/auth/my-audit').then((d) => setRows(d.rows)).catch(() => setRows([]));
  }, []);

  const saveEmail = async (e) => {
    e.preventDefault();
    try { setMsg({ ok: true, text: (await api.put('/api/auth/account', { email })).message }); }
    catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    try {
      setMsg({ ok: true, text: (await api.post('/api/auth/change-password', pw)).message });
      setPw({ current: '', next: '' });
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  return (
    <Layout>
      <h1><UserRound size={22} style={{ verticalAlign: '-3px' }} /> Mein Konto</h1>
      <p className="sub">Zugangsdaten für {user?.email} ({user?.role === 'admin' ? 'Administrator' : 'Experte'})</p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <div className="detail-grid" style={{ marginBottom: 26 }}>
        <form className="card" onSubmit={saveEmail}>
          <h3>E-Mail-Adresse</h3>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Neue E-Mail-Adresse</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className="btn" style={{ width: 'auto' }}>Speichern</button>
        </form>
        <form className="card" onSubmit={savePw}>
          <h3>Passwort ändern</h3>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Aktuelles Passwort</label>
            <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          </div>
          <div className="field">
            <label>Neues Passwort (mind. 10 Zeichen)</label>
            <input type="password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          </div>
          <button className="btn" style={{ width: 'auto' }}>Passwort ändern</button>
        </form>
      </div>

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '0 0 10px' }}>Meine Änderungshistorie</h2>
      {rows ? <AuditTable rows={rows} /> : <p className="sub">Laden…</p>}
    </Layout>
  );
}
