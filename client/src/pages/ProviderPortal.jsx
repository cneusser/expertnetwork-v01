/** v1.16.0 — Provider-Portal: eigenes Firmenprofil pflegen (Fokus, Tagessatz-Range, Hauptprojekte). */
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

export default function ProviderPortal() {
  const [profil, setProfil] = useState(null);
  const [msg, setMsg] = useState(null);
  const [fokusNeu, setFokusNeu] = useState('');

  const load = () => api.get('/api/provider/me').then((d) => setProfil({
    ...d.profil,
    fokus: typeof d.profil.fokus_json === 'string' ? JSON.parse(d.profil.fokus_json || '[]') : (d.profil.fokus_json || []),
  })).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);

  if (!profil) return <Layout><p className="sub">Laden…</p></Layout>;

  const speichern = async () => {
    setMsg(null);
    try {
      await api.put('/api/provider/me', {
        firmenname: profil.firmenname, ansprechpartner: profil.ansprechpartner, telefon: profil.telefon,
        webseite: profil.webseite, fokus: profil.fokus,
        tagessatz_von: profil.tagessatz_von, tagessatz_bis: profil.tagessatz_bis,
        hauptprojekte: profil.hauptprojekte,
      });
      setMsg({ ok: true, text: 'Profil gespeichert, vielen Dank.' });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const feld = (label, key, typ = 'text') => (
    <div className="field" style={{ flex: '1 1 200px' }}>
      <label>{label}</label>
      <input type={typ} value={profil[key] || ''} onChange={(e) => setProfil({ ...profil, [key]: e.target.value })} />
    </div>
  );

  return (
    <Layout>
      <h1><Building2 size={22} style={{ verticalAlign: '-3px' }} /> Provider-Profil</h1>
      <p className="sub">So wissen wir, wann eure Anfragen und unsere Profile zusammenpassen.</p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {feld('Firmenname', 'firmenname')}
          {feld('Ansprechpartner', 'ansprechpartner')}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {feld('Telefon', 'telefon')}
          {feld('Webseite', 'webseite')}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {feld('Tagessatz von (EUR)', 'tagessatz_von', 'number')}
          {feld('Tagessatz bis (EUR)', 'tagessatz_bis', 'number')}
        </div>
        <div className="field">
          <label>Fokus (Branchen, Funktionen)</label>
          <p>{profil.fokus.map((f) => (
            <span className="tag" key={f}>{f}{' '}
              <span style={{ cursor: 'pointer', fontWeight: 700 }}
                onClick={() => setProfil({ ...profil, fokus: profil.fokus.filter((x) => x !== f) })}>×</span></span>
          ))}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={fokusNeu} onChange={(e) => setFokusNeu(e.target.value)} placeholder="z. B. Restrukturierung" />
            <button type="button" className="btn" style={{ width: 'auto' }}
              onClick={() => { if (fokusNeu.trim()) { setProfil({ ...profil, fokus: [...profil.fokus, fokusNeu.trim()] }); setFokusNeu(''); } }}>+</button>
          </div>
        </div>
        <div className="field">
          <label>Typische Hauptprojekte</label>
          <textarea rows={4} value={profil.hauptprojekte || ''} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14 }}
            onChange={(e) => setProfil({ ...profil, hauptprojekte: e.target.value })} />
        </div>
        <button className="btn" style={{ width: 'auto' }} onClick={speichern}>Speichern</button>
      </div>
      <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
        Bald an dieser Stelle: regelmäßige Updates zu neuen und wieder verfügbaren Profilen aus dem Netzwerk.
      </p>
    </Layout>
  );
}
