/** v1.2.0 — Hidden-Link für Kunden: Projekt + kuratierte Profilkarten + PDF-Download. */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import Logo from '../components/Logo';
import { api } from '../api/client';

export default function ShareView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/api/public/share/${token}`).then(setData).catch((e) => setError(e.message));
  }, [token]);

  if (error) return <div className="auth-wrap"><div className="auth-card"><Logo /><div className="msg msg-error" style={{ marginTop: 16 }}>{error}</div></div></div>;
  if (!data) return <div className="auth-wrap"><div className="auth-card"><Logo /><p className="sub" style={{ marginTop: 16 }}>Laden…</p></div></div>;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Logo />
        <a href={`/api/public/share/${token}/pdf`} className="btn" style={{ width: 'auto', textDecoration: 'none' }}>
          <Download size={15} /> Shortlist als PDF
        </a>
      </div>
      <h1 style={{ color: 'var(--navy)', margin: '20px 0 6px', fontSize: 26 }}>{data.project.name}</h1>
      <p className="muted">
        Referenz {data.project.referenz || '—'}{data.project.ort ? ` · ${data.project.ort}` : ''}
        {data.expires_at ? ` · Link gültig bis ${new Date(data.expires_at).toLocaleDateString('de-DE')}` : ''}
      </p>
      {data.project.beschreibung && (
        <div className="card" style={{ margin: '16px 0' }}><p style={{ whiteSpace: 'pre-line' }}>{data.project.beschreibung}</p></div>
      )}

      <h2 style={{ fontSize: 19, color: 'var(--navy)', margin: '22px 0 12px' }}>Vorgeschlagene Profile ({data.profiles.length})</h2>
      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {data.profiles.map((p, i) => (
          <div className="card" key={i} style={{ borderTop: '3px solid var(--navy)' }}>
            <h3 style={{ fontSize: 17 }}>{p.anzeige_name}</h3>
            <p className="muted">{p.rolle}</p>
            <p style={{ marginTop: 10, fontSize: 13.5 }}><strong>Hintergrund:</strong> {(p.hintergrund || '—').slice(0, 400)}</p>
            {p.projekterfahrung && <p style={{ marginTop: 8, fontSize: 13.5 }}>{p.projekterfahrung}</p>}
            <p style={{ marginTop: 10 }}>{(p.schwerpunkte || []).map((s) => <span className="tag" key={s}>{s}</span>)}</p>
            {p.verfuegbarkeit && <p className="muted" style={{ marginTop: 8 }}>Verfügbarkeit: {p.verfuegbarkeit}</p>}
            <p style={{ marginTop: 10, fontWeight: 600, color: 'var(--navy)' }}>Honorar auf Anfrage</p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3>Sprechen Sie uns gerne jederzeit an</h3>
        <p style={{ marginTop: 8 }}>
          Dr. Christian Neusser · Phalanx GmbH<br />
          Helene-Lange-Straße 28 · 91056 Erlangen<br />
          +49 9131 920 60 75 · +49 151 625 00 802 · <a href="mailto:neusser@phalanx.de">neusser@phalanx.de</a>
        </p>
      </div>
    </div>
  );
}
