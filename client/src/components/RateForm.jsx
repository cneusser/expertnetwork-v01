/** Tagessatz erfassen (Insert-only) — genutzt von Admin-Detail und /profil. */
import { useState } from 'react';

const KATEGORIEN = { remote: 'Remote', vor_ort: 'Vor Ort', interim: 'Interim', projektleitung: 'Projektleitung', beratung: 'Beratung' };

export default function RateForm({ onSave }) {
  const [f, setF] = useState({ kategorie: 'interim', von: '', bis: '', ab: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await onSave({
        kategorie: f.kategorie,
        satz_von_eur: Number(f.von),
        satz_bis_eur: f.bis ? Number(f.bis) : null,
        gueltig_ab: f.ab,
      });
      setMsg({ ok: true, text: 'Satz erfasst — die Historie bleibt erhalten.' });
      setF({ ...f, von: '', bis: '' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ marginTop: 16 }}>
      <h3>Neuen Tagessatz erfassen</h3>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
          <label>Kategorie</label>
          <select value={f.kategorie} onChange={(e) => setF({ ...f, kategorie: e.target.value })}>
            {Object.entries(KATEGORIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, width: 120 }}>
          <label>Satz von (€)</label>
          <input type="number" min="1" required value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0, width: 120 }}>
          <label>bis (optional)</label>
          <input type="number" min="1" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Gültig ab</label>
          <input type="date" required value={f.ab} onChange={(e) => setF({ ...f, ab: e.target.value })} />
        </div>
        <button className="btn" style={{ width: 'auto' }} disabled={busy}>Erfassen</button>
      </div>
    </form>
  );
}
