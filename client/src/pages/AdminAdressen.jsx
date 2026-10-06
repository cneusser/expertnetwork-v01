/**
 * v1.41.0 — Adressen: Vorschläge sehen und entscheiden.
 *
 * Nichts auf dieser Seite passiert von allein. Der Zerleger schlägt vor, hier
 * entscheidet ein Mensch. Die sicheren Fälle lassen sich gesammelt übernehmen,
 * die gemeldeten nie: Sie sind gemeldet, weil jemand hinsehen muss.
 */
import { useEffect, useState } from 'react';
import { MapPin, Check, X, Play, Eye } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { Anschrift } from '../components/Anschrift';

export default function AdminAdressen() {
  const [v, setV] = useState(null);
  const [probe, setProbe] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const laden = () => api.get('/api/adressen/vorschlaege').then(setV).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { laden(); }, []);

  const wrap = async (fn) => {
    setBusy(true);
    try { const d = await fn(); setMsg({ ok: true, text: d?.message || 'Erledigt.' }); await laden(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <Layout>
      <h1><MapPin size={22} style={{ verticalAlign: '-3px' }} /> Adressen</h1>
      <p className="sub">
        Gewachsene Adressen in getrennte Felder bringen. Zerlegt wird nur, was eindeutig ist.
        Alles andere steht unten und wartet auf eine Entscheidung. Nichts wird automatisch überschrieben.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 20px' }}>
        <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px' }} disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { setProbe(await api.get('/api/adressen/trockenlauf')); }
            catch (e) { setMsg({ ok: false, text: e.message }); }
            finally { setBusy(false); }
          }}>
          <Eye size={15} style={{ verticalAlign: '-2px' }} /> Trockenlauf
        </button>
        <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px' }} disabled={busy}
          onClick={() => wrap(() => api.post('/api/adressen/lauf', {}))}>
          <Play size={15} style={{ verticalAlign: '-2px' }} /> Vorschläge erzeugen
        </button>
      </div>

      {probe && (
        <div className="notice" style={{ marginBottom: 20 }}>
          <strong>Trockenlauf, nichts verändert.</strong><br />
          {probe.geprueft} Adressen geprüft: <strong>{probe.sicher}</strong> wären sicher zerlegt,{' '}
          <strong>{probe.gemeldet}</strong> müsste jemand ansehen.
          {probe.schon_zerlegt > 0 && <> {probe.schon_zerlegt} stehen schon in Feldern.</>}
          {probe.ohne_adresse > 0 && <> {probe.ohne_adresse} haben gar keine Adresse.</>}
          {Object.keys(probe.gruende || {}).length > 0 && (
            <ul style={{ margin: '8px 0 0 18px', fontSize: 13 }}>
              {Object.entries(probe.gruende).map(([g, n]) => <li key={g}>{n}× {g}</li>)}
            </ul>
          )}
        </div>
      )}

      {v && (
        <>
          <h2 className="abschnitt">Sicher zerlegt ({v.sicher.length})</h2>
          {v.sicher.length > 0 && (
            <p style={{ fontSize: 13 }}>
              <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }} disabled={busy}
                onClick={() => wrap(() => api.post('/api/adressen/vorschlaege/sichere-uebernehmen', {}))}>
                Alle {v.sicher.length} übernehmen
              </button>
            </p>
          )}
          <Liste eintraege={v.sicher} wrap={wrap} busy={busy} leer="Nichts offen." />

          <h2 className="abschnitt" style={{ marginTop: 28 }}>Zum Ansehen ({v.gemeldet.length})</h2>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Hier wurde bewusst nicht geraten. Eine falsch zerlegte Adresse sieht ordentlich aus und ist
            trotzdem falsch, und auf einer Rechnung merkt man das erst, wenn sie zurückkommt.
          </p>
          <Liste eintraege={v.gemeldet} wrap={wrap} busy={busy} leer="Nichts zu klären." zeigeGrund />
        </>
      )}
    </Layout>
  );
}

function Liste({ eintraege, wrap, busy, leer, zeigeGrund = false }) {
  if (!eintraege.length) return <p className="muted">{leer}</p>;
  return (
    <table className="table">
      <thead><tr>
        <th>Wer</th><th>Bisher</th><th>Vorschlag</th>{zeigeGrund && <th>Grund</th>}<th />
      </tr></thead>
      <tbody>
        {eintraege.map((e) => (
          <tr key={e.id}>
            <td>{e.name} <span className="muted">{e.subjekt_typ === 'expert' ? 'Experte' : 'Kunde'}</span>
              {e.herkunft === 'pool' && <><br /><span className="tag">aus Phalanx OS</span></>}</td>
            <td style={{ fontSize: 13 }}>{e.original || <span className="muted">leer</span>}</td>
            <td style={{ fontSize: 13 }}><Anschrift a={e.vorschlag} leer="nicht zerlegbar" /></td>
            {zeigeGrund && <td style={{ fontSize: 12.5 }}>{e.grund}</td>}
            <td style={{ whiteSpace: 'nowrap' }}>
              {e.vorschlag?.strasse && e.vorschlag?.ort && (
                <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }} disabled={busy}
                  onClick={() => wrap(() => api.post(`/api/adressen/vorschlaege/${e.id}/uebernehmen`, {}))}>
                  <Check size={14} style={{ verticalAlign: '-2px' }} /> Übernehmen
                </button>
              )}
              <button type="button" className="tab" style={{ padding: 0, marginLeft: 10, color: 'var(--grey-600)' }} disabled={busy}
                onClick={() => wrap(() => api.post(`/api/adressen/vorschlaege/${e.id}/verwerfen`, {}))}>
                <X size={14} style={{ verticalAlign: '-2px' }} /> Verwerfen
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
