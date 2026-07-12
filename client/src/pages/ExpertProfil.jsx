/** Self-Service: Experte pflegt Profil und Tagessätze selbst. */
import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import Layout from '../components/Layout';
import ProfileForm from '../components/ProfileForm';
import RateForm from '../components/RateForm';
import KiCvAssistent from '../components/KiCvAssistent';
import { api } from '../api/client';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

export default function ExpertProfil() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => api.get('/api/experts/me').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <Layout><div className="msg msg-error">{error}</div></Layout>;
  if (!data) return <Layout><p className="sub">Laden…</p></Layout>;
  const { expert, skills, rates, documents } = data;

  return (
    <Layout>
      <h1>Mein Profil</h1>
      <p className="sub">{expert.berufsbezeichnung}</p>
      {saved && <div className="msg msg-success">Profil gespeichert — vielen Dank.</div>}

      {editing ? (
        <div className="detail-grid">
          <ProfileForm
            expert={expert}
            onSave={async (payload) => {
              await api.put('/api/experts/me', payload);
              setEditing(false);
              setSaved(true);
              await load();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3>{expert.vorname} {expert.nachname}</h3>
              <p className="muted">{expert.firma} · {expert.email} · {expert.mobil}</p>
            </div>
            <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => { setSaved(false); setEditing(true); }}>
              <Pencil size={14} /> Bearbeiten
            </button>
          </div>
          <div className="detail-grid">
            <div className="card">
              <h3>Kurzprofil</h3>
              <p>{expert.kurzprofil || '—'}</p>
            </div>
            <div className="card">
              <h3>Meine Skills</h3>
              <p>{skills.map((s) => <span className="tag" key={s.id}>{s.name}</span>)}</p>
              <p className="muted" style={{ marginTop: 8 }}>Skill-Änderungen derzeit über die Phalanx GmbH.</p>
            </div>
            <div className="card">
              <h3>Meine Dokumente</h3>
              <p>{documents.length} Dokument(e) im geschützten Bereich hinterlegt.</p>
            </div>
          </div>
        </>
      )}

      <KiCvAssistent onApplied={load} />

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '28px 0 12px' }}>Meine Tagessätze</h2>
      <table className="table">
        <thead><tr><th>Kategorie</th><th>Satz</th><th>Gültig ab</th><th>Erfasst</th></tr></thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.id}>
              <td>{r.kategorie}</td>
              <td>{r.satz_von_eur}{r.satz_bis_eur ? ` – ${r.satz_bis_eur}` : ''} € / Tag</td>
              <td>{fmtDate(r.gueltig_ab)}</td>
              <td>{fmtDate(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <RateForm onSave={async (payload) => { await api.post('/api/experts/me/rates', payload); await load(); }} />

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '28px 0 12px' }}>Datenschutz (DSGVO)</h2>
      <div className="card">
        <p style={{ marginBottom: 14 }}>
          Sie können jederzeit eine vollständige Kopie Ihrer gespeicherten Daten herunterladen
          (Art. 20 DSGVO) oder Ihre Einwilligung widerrufen (Art. 7 Abs. 3 DSGVO). Nach einem
          Widerruf wird Ihr Profil gesperrt und anschließend gelöscht bzw. anonymisiert.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href="/api/experts/me/export" className="btn" style={{ width: 'auto', textDecoration: 'none' }}>
            Meine Daten exportieren (ZIP)
          </a>
          <button className="btn" style={{ width: 'auto', background: 'var(--danger)' }}
            onClick={async () => {
              if (!window.confirm('Einwilligung wirklich widerrufen? Ihr Profil wird gesperrt und Ihre Daten werden gelöscht bzw. anonymisiert.')) return;
              const d = await api.post('/api/auth/revoke-consent');
              window.alert(d.message);
              window.location.href = '/login';
            }}>
            Einwilligung widerrufen
          </button>
        </div>
      </div>
    </Layout>
  );
}
