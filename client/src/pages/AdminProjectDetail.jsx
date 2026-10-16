/** Sprint 6 — Projekt-Detail: Matching-Vorschläge + Bewerbungs-Pipeline (Admin). */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const APP_STATUS = ['vorgeschlagen', 'beworben', 'im_gespraech', 'angeboten', 'abgelehnt', 'besetzt'];
const STATUS_LABEL = { entwurf: 'Entwurf', offen: 'Offen', besetzt: 'Besetzt', geschlossen: 'Geschlossen' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

export default function AdminProjectDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [ki, setKi] = useState({}); // expertId -> Text
  const [shareLinks, setShareLinks] = useState([]);

  const load = () => {
    api.get(`/api/projects/${id}`).then(setData).catch((e) => setError(e.message));
    api.get(`/api/projects/${id}/share`).then((d) => setShareLinks(d.links)).catch(() => {});
  };
  useEffect(() => { load(); }, [id]);

  if (error) return <Layout><div className="msg msg-error">{error}</div></Layout>;
  if (!data) return <Layout><p className="sub">Laden…</p></Layout>;
  const { project, skills, applications, matches, releases = [], vendor } = data;

  const release = async (expertId) => {
    const anonymized = window.confirm('Profil ANONYMISIERT freigeben? (OK = anonymisiert, Abbrechen = mit Klarnamen)');
    await api.post(`/api/projects/${id}/releases`, { expert_id: expertId, anonymized });
    load();
  };

  return (
    <Layout>
      <p><Link to="/admin/projekte"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Zurück zu Projekten</Link></p>
      <h1>{project.name}</h1>
      <p className="sub">
        {fmtDate(project.start)} – {fmtDate(project.ende)} · {project.ort || 'ortsunabhängig'} · {project.arbeitsmodell}
        {project.tagessatz_bis_eur ? ` · Satz bis ${project.tagessatz_bis_eur} €` : ''}
        {' · Status: '}
        <select value={project.status} style={{ fontSize: 13 }}
          onChange={async (e) => { await api.put(`/api/projects/${id}`, { status: e.target.value }); load(); }}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </p>
      {vendor && (
        <div className="notice">
          Kundenprojekt von <strong>{vendor.email}</strong>
          {project.status === 'eingereicht' && ' — wartet auf Freigabe (Status auf „Offen" setzen).'}
          {releases.length > 0 && ` · ${releases.length} Profil(e) für den Kunden freigegeben.`}
        </div>
      )}
      {project.beschreibung && <div className="card" style={{ marginBottom: 14 }}><p>{project.beschreibung}</p></div>}
      <p style={{ marginBottom: 20 }}>{skills.map((s) => <span className="tag" key={s.id}>{s.name}</span>)}</p>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Hidden-Links für Kunden (Projekt + freigegebene Profile, mit PDF &amp; PPTX)</h3>
        <p style={{ margin: '6px 0 10px' }}>
          <a href={`/api/projects/${id}/profile-pptx`} className="btn" style={{ width: 'auto', padding: '6px 14px', textDecoration: 'none', display: 'inline-block' }}>
            Sammelprofil als PPTX (Phalanx-Format)</a>
        </p>
        {shareLinks.filter((l) => !l.revoked_at).map((l) => (
          <p key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, marginTop: 8, flexWrap: 'wrap' }}>
            <code style={{ background: 'var(--grey-100)', padding: '4px 8px', borderRadius: 4 }}>{`${window.location.origin}/s/${l.token}`}</code>
            <span className="muted">bis {new Date(l.expires_at).toLocaleDateString('de-DE')} · {l.zugriffe} Zugriff(e)</span>
            <button type="button" className="tab" style={{ padding: 0, color: 'var(--accent)' }}
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/s/${l.token}`)}>Kopieren</button>
            <button type="button" className="tab" style={{ padding: 0, color: 'var(--danger)' }}
              onClick={async () => { await api.del(`/api/projects/${id}/share/${l.id}`); load(); }}>Widerrufen</button>
          </p>
        ))}
        <button type="button" className="btn" style={{ width: 'auto', marginTop: 10, padding: '8px 16px' }}
          onClick={async () => { await api.post(`/api/projects/${id}/share`, { gueltig_tage: 30 }); load(); }}>
          Neuen Hidden-Link erzeugen (30 Tage)
        </button>
        <p className="muted" style={{ marginTop: 8 }}>Zeigt Projekt + alle „Für Kunden freigegeben"-Profile — ideal für Kunden ohne eigenen Zugang. Jeder Zugriff wird protokolliert.</p>
      </div>

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '18px 0 10px' }}>Pipeline ({applications.length})</h2>
      {applications.length ? (
        <table className="table">
          <thead><tr><th>Kandidat</th><th>Match</th><th>Begründung</th><th>Nachricht</th><th>Status</th></tr></thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/admin/experten/${a.expert_id}`}><strong>{a.vorname} {a.nachname}</strong></Link><br />
                  <span className="muted">{a.berufsbezeichnung?.split('—')[0]}</span></td>
                <td><strong>{a.matching_score ?? '—'} %</strong></td>
                <td style={{ fontSize: 12.5, maxWidth: 320 }}>{a.begruendung}</td>
                <td style={{ fontSize: 12.5, maxWidth: 200 }}>{a.nachricht || '—'}</td>
                <td>
                  <select value={a.status}
                    onChange={async (e) => { await api.put(`/api/projects/${id}/applications/${a.id}`, { status: e.target.value }); load(); }}>
                    {APP_STATUS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  {vendor && (
                    releases.some((r) => r.expert_id === a.expert_id)
                      ? <div className="muted" style={{ marginTop: 4 }}>✓ für Kunden freigegeben</div>
                      : <button type="button" className="tab" style={{ padding: '4px 0', color: 'var(--accent)' }}
                          onClick={() => release(a.expert_id)}>Für Kunden freigeben</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="sub">Noch keine Kandidaten in der Pipeline.</p>}

      {/* v1.43.0: Der direkte Weg zum Kunden, ohne Umweg über eine Freigabe.
          Ankreuzen, Vorlage bauen, Link verschicken. */}
      <Vorlagenleiste projektId={id} matches={matches} applications={applications} />

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '26px 0 10px' }}>Matching-Vorschläge</h2>
      {matches.length ? (
        <table className="table">
          <thead><tr><th>Experte</th><th>Match</th><th>Aufschlüsselung</th><th>Begründung</th><th></th></tr></thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.expert.id}>
                <td><Link to={`/admin/experten/${m.expert.id}`}><strong>{m.expert.vorname} {m.expert.nachname}</strong></Link><br />
                  <span className="muted">{m.expert.berufsbezeichnung?.split('—')[0]}</span></td>
                <td><strong style={{ fontSize: 18, color: m.score >= 70 ? 'var(--success)' : m.score >= 40 ? '#d99b1f' : 'var(--danger)' }}>{m.score} %</strong></td>
                <td style={{ fontSize: 12.5 }}>
                  Skills {m.breakdown.skills} · Verfügbarkeit {m.breakdown.verfuegbarkeit} · Satz {m.breakdown.satz} · Frische {m.breakdown.frische}
                </td>
                <td style={{ fontSize: 12.5, maxWidth: 320 }}>
                  {m.begruendung}
                  {ki[m.expert.id] ? (
                    <div style={{ marginTop: 6, padding: 8, background: '#eaf0f6', borderRadius: 6 }}>🤖 {ki[m.expert.id]}</div>
                  ) : (
                    <div><button type="button" className="tab" style={{ padding: '4px 0', color: 'var(--accent)' }}
                      onClick={async () => {
                        try {
                          const d = await api.post(`/api/ai/explain/${id}/${m.expert.id}`);
                          setKi((k) => ({ ...k, [m.expert.id]: d.text }));
                        } catch (e) { setError(e.message); }
                      }}>KI-Begründung</button></div>
                  )}
                </td>
                <td><button className="btn" style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}
                  onClick={async () => { await api.post(`/api/projects/${id}/applications`, { expert_id: m.expert.id }); load(); }}>
                  In Pipeline aufnehmen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="sub">Keine weiteren Kandidaten.</p>}
    </Layout>
  );
}

/**
 * v1.43.0 — Profile zu einer Vorlage zusammenstellen.
 *
 * Die Auswahl steht hier und nicht in der Pipeline: Wer einem Kunden Profile
 * vorlegt, trifft eine Auswahl für diesen einen Kunden, und die hat mit dem
 * Stand der Pipeline nichts zu tun.
 */
function Vorlagenleiste({ projektId, matches, applications }) {
  const [offen, setOffen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState([]);
  const [empf, setEmpf] = useState({ firma: '', name: '', email: '' });
  const [aufschlag, setAufschlag] = useState(20);
  const [anschreiben, setAnschreiben] = useState('');
  const [ergebnis, setErgebnis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  // Kandidaten aus Pipeline und Matching, ohne Doppelte.
  const kandidaten = [];
  const gesehen = new Set();
  for (const a of applications || []) {
    if (gesehen.has(a.expert_id)) continue;
    gesehen.add(a.expert_id);
    kandidaten.push({ id: a.expert_id, name: `${a.vorname} ${a.nachname}`, rolle: a.berufsbezeichnung, quelle: 'Pipeline' });
  }
  for (const m of matches || []) {
    if (gesehen.has(m.expert.id)) continue;
    gesehen.add(m.expert.id);
    kandidaten.push({ id: m.expert.id, name: `${m.expert.vorname} ${m.expert.nachname}`,
      rolle: m.expert.berufsbezeichnung, quelle: `${m.score} %` });
  }

  if (!offen) {
    return (
      <div style={{ margin: '22px 0' }}>
        <button type="button" className="btn" style={{ width: 'auto', padding: '9px 18px' }}
          onClick={() => setOffen(true)} disabled={!kandidaten.length}>
          <Send size={15} style={{ verticalAlign: '-2px' }} /> Profile vorlegen
        </button>
        {!kandidaten.length && <span className="muted" style={{ marginLeft: 10 }}>Erst Kandidaten, dann Vorlage.</span>}
      </div>
    );
  }

  if (ergebnis) {
    return (
      <div className="card" style={{ margin: '22px 0', borderLeft: '3px solid var(--success)' }}>
        <h3>Vorlage steht</h3>
        <p>{ergebnis.message}</p>
        {ergebnis.link ? (
          <p>
            Link für den Kunden:<br />
            <a href={ergebnis.link} target="_blank" rel="noreferrer"><code>{ergebnis.link}</code></a>
          </p>
        ) : (
          <p className="muted">Noch ein Entwurf. Erst nach dem Freigeben trägt der Link.</p>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          {!ergebnis.link && (
            <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px', marginBottom: 0 }}
              disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  const d = await api.post(`/api/vorlagen/${ergebnis.id}/freigeben`, {});
                  setErgebnis((e) => ({ ...e, link: d.link, message: d.message }));
                } catch (e) { setFehler(e.message); } finally { setBusy(false); }
              }}>Freigeben, Link gilt ab dann</button>
          )}
          <a className="tab" style={{ color: 'var(--navy)' }} href={`/api/vorlagen/${ergebnis.id}`} onClick={(e) => e.preventDefault()}>
            {ergebnis.profile} Profile · Aufschlag {ergebnis.aufschlag} Prozent
          </a>
          <button type="button" className="tab" style={{ color: 'var(--grey-600)' }}
            onClick={() => { setErgebnis(null); setOffen(false); setGewaehlt([]); }}>Fertig</button>
        </div>
        {fehler && <div className="msg msg-error" style={{ marginTop: 10 }}>{fehler}</div>}
      </div>
    );
  }

  return (
    <div className="card" style={{ margin: '22px 0' }}>
      <h3>Profile vorlegen</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        Anonyme Kurzprofile mit Tagessatz und einer Einschätzung zur Anfrage. Der Kunde bekommt
        einen Link, braucht aber kein Konto.
      </p>
      {fehler && <div className="msg msg-error">{fehler}</div>}

      <div style={{ margin: '12px 0' }}>
        {kandidaten.map((k) => (
          <label key={k.id} style={{ display: 'block', padding: '5px 0', fontSize: 13.5 }}>
            <input type="checkbox" style={{ marginRight: 8 }}
              checked={gewaehlt.includes(k.id)}
              onChange={(e) => setGewaehlt((g) => (e.target.checked ? [...g, k.id] : g.filter((x) => x !== k.id)))} />
            <strong>{k.name}</strong> <span className="muted">{k.rolle} · {k.quelle}</span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 200px' }}><label>Empfänger (Firma)</label>
          <input value={empf.firma} onChange={(e) => setEmpf({ ...empf, firma: e.target.value })} placeholder="SOLCOM" /></div>
        <div className="field" style={{ flex: '1 1 180px' }}><label>Name</label>
          <input value={empf.name} onChange={(e) => setEmpf({ ...empf, name: e.target.value })} /></div>
        <div className="field" style={{ flex: '1 1 200px' }}><label>E-Mail</label>
          <input type="email" value={empf.email} onChange={(e) => setEmpf({ ...empf, email: e.target.value })} /></div>
        <div className="field" style={{ flex: '0 0 130px' }}><label>Aufschlag %</label>
          <input type="number" min={0} max={200} value={aufschlag}
            onChange={(e) => setAufschlag(Number(e.target.value))} /></div>
      </div>

      <div className="field">
        <label>Anschreiben <span className="muted">steht oben auf der Übersicht</span></label>
        <textarea rows={3} value={anschreiben} onChange={(e) => setAnschreiben(e.target.value)}
          placeholder="Guten Tag, anbei drei Profile zu Ihrer Anfrage …" />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" style={{ width: 'auto', padding: '9px 18px', marginBottom: 0 }}
          disabled={busy || !gewaehlt.length} onClick={async () => {
            setBusy(true); setFehler('');
            try {
              const d = await api.post('/api/vorlagen', {
                project_id: Number(projektId),
                expert_ids: gewaehlt,
                empfaenger: { firma: empf.firma || null, name: empf.name || null, email: empf.email || null },
                aufschlag_prozent: aufschlag,
                anschreiben: anschreiben || null,
              });
              setErgebnis({ id: d.vorlage.id, message: d.message, link: null,
                profile: d.positionen.length, aufschlag: d.vorlage.aufschlag_prozent });
            } catch (e) { setFehler(e.message); } finally { setBusy(false); }
          }}>
          {busy ? 'Baut…' : `${gewaehlt.length || 'Keine'} Profile zusammenstellen`}
        </button>
        <button type="button" className="tab" style={{ color: 'var(--grey-600)' }}
          onClick={() => setOffen(false)}>Abbrechen</button>
      </div>
    </div>
  );
}
