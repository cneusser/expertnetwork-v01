/** Sprint 5 — Suchseite (Admin): Volltext + Boolean, Facetten, gespeicherte Suchen. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Save, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const SKILL_KAT = [['rolle', 'Rollen'], ['kompetenz', 'Kompetenzen'], ['branche', 'Branchen'], ['zertifikat', 'Zertifikate'], ['technologie', 'Technologien']];
const AVAIL_LABEL = { sofort: 'Sofort', ab_datum: 'Ab Datum', teilweise: 'Teilweise', ausgebucht: 'Ausgebucht' };

const EMPTY = { q: '', skills: [], satz_min: '', satz_max: '', verfuegbar: '', ab_datum: '', arbeitsmodell: '', sprache: '', ampel: '' };

export default function AdminSearch() {
  const [meta, setMeta] = useState({ skills: [] });
  const [f, setF] = useState(EMPTY);
  const [data, setData] = useState(null);
  const [saved, setSaved] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/search/meta').then(setMeta).catch(() => {});
    loadSaved();
  }, []);
  const loadSaved = () => api.get('/api/search/saved').then((d) => setSaved(d.searches)).catch(() => {});

  const run = async (params = f) => {
    setError('');
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.skills.length) qs.set('skills', params.skills.join(','));
      for (const k of ['satz_min', 'satz_max', 'verfuegbar', 'ab_datum', 'arbeitsmodell', 'sprache', 'ampel']) {
        if (params[k]) qs.set(k, params[k]);
      }
      setData(await api.get(`/api/search?${qs}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleSkill = (id) => {
    const skills = f.skills.includes(id) ? f.skills.filter((s) => s !== id) : [...f.skills, id];
    const next = { ...f, skills };
    setF(next);
    run(next);
  };

  const saveSearch = async () => {
    const name = window.prompt('Name der gespeicherten Suche:');
    if (!name) return;
    await api.post('/api/search/saved', { name, params: f });
    loadSaved();
  };

  return (
    <Layout>
      <h1><Search size={22} style={{ verticalAlign: '-3px' }} /> Suche</h1>
      <p className="sub">Boolean-Syntax wie bei LinkedIn: <code>SAP AND (Interim OR CRO) NOT Automotive</code></p>
      {error && <div className="msg msg-error">{error}</div>}

      <form className="card" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 320px' }}>
            <label>Suchbegriffe</label>
            <input type="text" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="z. B. Turnaround AND Qualitätsmanagement" />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 110 }}>
            <label>Satz von (€)</label>
            <input type="number" value={f.satz_min} onChange={(e) => setF({ ...f, satz_min: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 110 }}>
            <label>bis (€)</label>
            <input type="number" value={f.satz_max} onChange={(e) => setF({ ...f, satz_max: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 150 }}>
            <label>Verfügbarkeit</label>
            <select value={f.verfuegbar} onChange={(e) => setF({ ...f, verfuegbar: e.target.value })}>
              <option value="">Alle</option>
              <option value="jetzt">Verfügbar jetzt</option>
              <option value="ab_datum">Verfügbar ab…</option>
            </select>
          </div>
          {f.verfuegbar === 'ab_datum' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Ab</label>
              <input type="date" value={f.ab_datum} onChange={(e) => setF({ ...f, ab_datum: e.target.value })} />
            </div>
          )}
          <div className="field" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Arbeitsmodell</label>
            <select value={f.arbeitsmodell} onChange={(e) => setF({ ...f, arbeitsmodell: e.target.value })}>
              <option value="">Alle</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="vor_ort">Vor Ort</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, width: 130 }}>
            <label>Sprache</label>
            <input type="text" value={f.sprache} onChange={(e) => setF({ ...f, sprache: e.target.value })} placeholder="Englisch" />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 110 }}>
            <label>Frische</label>
            <select value={f.ampel} onChange={(e) => setF({ ...f, ampel: e.target.value })}>
              <option value="">Alle</option>
              <option value="gruen">Grün</option>
              <option value="gelb">Gelb</option>
              <option value="rot">Rot</option>
            </select>
          </div>
          <button className="btn" style={{ width: 'auto' }} disabled={busy}>{busy ? 'Suchen…' : 'Suchen'}</button>
          <button type="button" className="btn" style={{ width: 'auto', background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}
            onClick={saveSearch}><Save size={14} /> Suche speichern</button>
        </div>
        {saved.length > 0 && (
          <p style={{ marginTop: 12, fontSize: 13 }}>
            Gespeichert:{' '}
            {saved.map((s) => (
              <span className="tag" key={s.id} style={{ cursor: 'pointer' }}
                onClick={() => {
                  const params = { ...EMPTY, ...(typeof s.params_json === 'string' ? JSON.parse(s.params_json) : s.params_json) };
                  setF(params);
                  run(params);
                }}>
                {s.name}{' '}
                <Trash2 size={11} style={{ verticalAlign: '-1px' }}
                  onClick={async (e) => { e.stopPropagation(); await api.del(`/api/search/saved/${s.id}`); loadSaved(); }} />
              </span>
            ))}
          </p>
        )}
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ maxHeight: 560, overflowY: 'auto' }}>
          <h3>Facetten</h3>
          {SKILL_KAT.map(([kat, label]) => {
            const items = meta.skills.filter((s) => s.kategorie === kat);
            return items.length ? (
              <div key={kat} style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 12.5, color: 'var(--grey-600)', textTransform: 'uppercase' }}>{label}</strong>
                {items.map((s) => (
                  <label key={s.id} style={{ display: 'flex', gap: 8, fontSize: 13.5, padding: '3px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={f.skills.includes(s.id)} onChange={() => toggleSkill(s.id)} />
                    <span>{s.name}{data?.facetCounts?.[s.id] ? ` (${data.facetCounts[s.id]})` : ''}</span>
                  </label>
                ))}
              </div>
            ) : null;
          })}
        </div>

        <div>
          {!data && <p className="sub">Suche starten — Treffer erscheinen hier.</p>}
          {data && (
            <>
              <p className="sub">{data.count} Treffer</p>
              <table className="table">
                <thead><tr><th>Name</th><th>Rolle</th><th>Verfügbarkeit</th><th>Frische</th><th>Satz</th><th>Skills</th></tr></thead>
                <tbody>
                  {data.results.map((e) => {
                    const latest = e.availabilities?.[0];
                    return (
                      <tr key={e.id}>
                        <td><Link to={`/admin/experten/${e.id}`}><strong>{e.vorname} {e.nachname}</strong></Link><br />
                          <span className="muted">{e.firma}</span></td>
                        <td>{e.berufsbezeichnung?.split('—')[0]}</td>
                        <td>{latest ? `${AVAIL_LABEL[latest.status] || latest.status}${latest.auslastung_prozent ? ` (${latest.auslastung_prozent} %)` : ''}` : '—'}
                          {e.freshness?.nichtBestaetigt && <><br /><span className="status status-eingeladen">nicht bestätigt</span></>}</td>
                        <td><span className={`ampel ampel-${e.freshness?.ampel}`} />{e.freshness?.score}</td>
                        <td>{e.latestRate ? `${e.latestRate.satz_von_eur}${e.latestRate.satz_bis_eur ? '–' + e.latestRate.satz_bis_eur : ''} €` : '—'}</td>
                        <td>{e.skills.filter((s) => s.kategorie === 'kompetenz').slice(0, 3).map((s) => <span className="tag" key={s.id}>{s.name}</span>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
