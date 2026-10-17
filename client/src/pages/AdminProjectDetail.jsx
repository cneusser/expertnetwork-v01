/** Sprint 6 — Projekt-Detail: Matching-Vorschläge + Bewerbungs-Pipeline (Admin). */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Download} from 'lucide-react';
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

      {/* v1.44.0: Eine Liste. Hier wird ausgewählt und gehandelt, nicht in
          einer zweiten Liste darunter. */}
      <Pipeline projektId={id} applications={applications} neuLaden={load} />

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
 * v1.44.0 — Die Pipeline, und alles, was man mit einer Auswahl daraus tut.
 *
 * Vorher standen hier zwei Listen: die Pipeline und darunter noch einmal
 * dieselben Menschen zum Ankreuzen. Das war ein Baufehler. Wer in der
 * Pipeline steht, ist ausgewählt, und was man mit der Auswahl macht, steht
 * darüber.
 *
 * Die Strecke in einer Zeile:
 *   vorgeschlagen → angefragt → interessiert → vorgelegt → im Gespräch
 */
const STUFE = {
  vorgeschlagen: { label: 'vorgeschlagen', farbe: 'eingeladen' },
  beworben: { label: 'hat sich beworben', farbe: 'eingeladen' },
  angefragt: { label: 'angefragt', farbe: 'registriert' },
  interessiert: { label: 'hat Interesse', farbe: 'freigegeben' },
  abgesagt: { label: 'abgesagt', farbe: 'inaktiv' },
  vorgelegt: { label: 'beim Kunden', farbe: 'registriert' },
  im_gespraech: { label: 'im Gespräch', farbe: 'freigegeben' },
  angeboten: { label: 'Angebot', farbe: 'freigegeben' },
  besetzt: { label: 'besetzt', farbe: 'freigegeben' },
  abgelehnt: { label: 'abgelehnt', farbe: 'inaktiv' },
};

function Pipeline({ projektId, applications, neuLaden }) {
  const [gewaehlt, setGewaehlt] = useState([]);
  const [aktion, setAktion] = useState(null); // fragen | vorlegen
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const umschalten = (id, an) => setGewaehlt((g) => (an ? [...g, id] : g.filter((x) => x !== id)));
  const gewaehlteZeilen = applications.filter((a) => gewaehlt.includes(a.id));

  return (
    <>
      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '18px 0 10px' }}>
        Pipeline ({applications.length})
      </h2>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {!applications.length ? (
        <p className="sub">Noch keine Kandidaten. Nimm unten aus den Vorschlägen jemanden auf.</p>
      ) : (
        <>
          <table className="table">
            <thead><tr>
              <th style={{ width: 28 }} />
              <th>Kandidat</th><th>Match</th><th>Rückmeldung</th><th>Stand</th>
            </tr></thead>
            <tbody>
              {applications.map((a) => {
                const st = STUFE[a.status] || { label: a.status, farbe: 'eingeladen' };
                return (
                  <tr key={a.id}>
                    <td>
                      <input type="checkbox" checked={gewaehlt.includes(a.id)}
                        onChange={(e) => umschalten(a.id, e.target.checked)} />
                    </td>
                    <td>
                      <Link to={`/admin/experten/${a.expert_id}`}><strong>{a.vorname} {a.nachname}</strong></Link><br />
                      <span className="muted">{a.berufsbezeichnung?.split('—')[0]}</span>
                    </td>
                    <td><strong>{a.matching_score ?? '—'} %</strong></td>
                    <td style={{ fontSize: 12.5, maxWidth: 280 }}>
                      {a.antwort === 'interessiert' && (
                        <>
                          <span style={{ color: 'var(--success)' }}>Interesse</span>
                          {a.verfuegbar_ab && <>, ab {a.verfuegbar_ab}</>}
                          {a.auslastung && <>, {a.auslastung}</>}
                          {a.wunsch_satz_eur && <><br />Wunschsatz {a.wunsch_satz_eur} EUR</>}
                          {a.antwort_notiz && <><br /><span className="muted">{a.antwort_notiz}</span></>}
                        </>
                      )}
                      {a.antwort === 'abgesagt' && (
                        <>
                          <span className="muted">Abgesagt</span>
                          {a.antwort_notiz && <><br /><span className="muted">{a.antwort_notiz}</span></>}
                        </>
                      )}
                      {!a.antwort && a.anfrage_am && (
                        <span className="muted">gefragt am {new Date(a.anfrage_am).toLocaleDateString('de-DE')}, wartet</span>
                      )}
                      {!a.antwort && !a.anfrage_am && <span className="muted">—</span>}
                    </td>
                    <td>
                      <span className={`status status-${st.farbe}`}>{st.label}</span>
                      <br />
                      <select value={a.status} style={{ marginTop: 4, fontSize: 12 }}
                        onChange={async (e) => {
                          await api.put(`/api/projects/${projektId}/applications/${a.id}`, { status: e.target.value });
                          neuLaden();
                        }}>
                        {APP_STATUS.map((s) => (
                          <option key={s} value={s}>{STUFE[s]?.label || s.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0 8px' }}>
            <span className="muted" style={{ fontSize: 13 }}>
              {gewaehlt.length ? `${gewaehlt.length} gewählt:` : 'Zum Handeln ankreuzen'}
            </span>
            <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px', marginBottom: 0 }}
              disabled={!gewaehlt.length || busy} onClick={() => setAktion('fragen')}>
              <Send size={14} style={{ verticalAlign: '-2px' }} /> Anonym anfragen
            </button>
            <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px', marginBottom: 0 }}
              disabled={!gewaehlt.length || busy} onClick={() => setAktion('vorlegen')}>
              Profile vorlegen
            </button>
            {gewaehlt.length > 0 && (
              <button type="button" className="tab" style={{ color: 'var(--grey-600)' }}
                onClick={() => setGewaehlt([])}>Auswahl aufheben</button>
            )}
          </div>

          {aktion === 'fragen' && (
            <Anfragen projektId={projektId} zeilen={gewaehlteZeilen} busy={busy} setBusy={setBusy}
              fertig={(t) => { setAktion(null); setGewaehlt([]); setMsg(t); neuLaden(); }}
              abbrechen={() => setAktion(null)} />
          )}
          {aktion === 'vorlegen' && (
            <Vorlegen projektId={projektId} zeilen={gewaehlteZeilen}
              fertig={() => { setAktion(null); setGewaehlt([]); neuLaden(); }}
              abbrechen={() => setAktion(null)} />
          )}
        </>
      )}
    </>
  );
}

/**
 * Die Kandidaten anonym fragen, bevor ihr Profil zum Kunden geht.
 *
 * Spart die peinlichste Lage im Geschäft: ein vorgelegtes Profil, dessen
 * Inhaber gerade woanders unterschrieben hat.
 */
function Anfragen({ projektId, zeilen, busy, setBusy, fertig, abbrechen }) {
  const [frist, setFrist] = useState(7);
  const [fehler, setFehler] = useState('');
  const ohneMail = zeilen.filter((z) => !z.email);
  const schonGefragt = zeilen.filter((z) => z.antwort);

  return (
    <div className="card" style={{ margin: '12px 0' }}>
      <h3>Anonym anfragen</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        {zeilen.length} Kandidaten bekommen die Aufgabe, den Zeitraum und die Anforderungen.
        Wer der Kunde ist, steht nicht drin. Gefragt wird nach Interesse und Verfügbarkeit.
      </p>
      {fehler && <div className="msg msg-error">{fehler}</div>}
      {ohneMail.length > 0 && (
        <p className="muted" style={{ fontSize: 12.5 }}>
          Ohne Mailadresse und damit übersprungen: {ohneMail.map((z) => `${z.vorname} ${z.nachname}`).join(', ')}
        </p>
      )}
      {schonGefragt.length > 0 && (
        <p className="muted" style={{ fontSize: 12.5 }}>
          Haben schon geantwortet und werden nicht erneut behelligt: {schonGefragt.length}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
        <div className="field" style={{ flex: '0 0 150px', marginBottom: 0 }}>
          <label>Antwort bis in Tagen</label>
          <input type="number" min={1} max={60} value={frist} onChange={(e) => setFrist(Number(e.target.value))} />
        </div>
        <button type="button" className="btn" style={{ width: 'auto', padding: '9px 18px', marginBottom: 0 }}
          disabled={busy} onClick={async () => {
            setBusy(true); setFehler('');
            try {
              const d = await api.post(`/api/kandidatenanfrage/projekt/${projektId}/fragen`, {
                application_ids: zeilen.map((z) => z.id), frist_tage: frist,
              });
              fertig({ ok: true, text: d.message });
            } catch (e) { setFehler(e.message); } finally { setBusy(false); }
          }}>
          {busy ? 'Verschickt…' : 'Anfrage verschicken'}
        </button>
        <button type="button" className="tab" style={{ color: 'var(--grey-600)' }} onClick={abbrechen}>Abbrechen</button>
      </div>
    </div>
  );
}

/**
 * v1.43.0, umgebaut in v1.44.0 — Die gewählten Profile vorlegen.
 *
 * Die Auswahl kommt aus der Pipeline und wird hier nicht noch einmal
 * getroffen. Wer schon abgesagt hat, wird vorher benannt: Ein abgesagtes
 * Profil vorzulegen kostet beim Kunden mehr, als es bringt.
 */
function Vorlegen({ projektId, zeilen, fertig, abbrechen }) {
  const [empf, setEmpf] = useState({ firma: '', name: '', email: '' });
  const [aufschlag, setAufschlag] = useState(20);
  const [anschreiben, setAnschreiben] = useState('');
  const [ergebnis, setErgebnis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const abgesagt = zeilen.filter((z) => z.antwort === 'abgesagt');
  const ohneZusage = zeilen.filter((z) => z.antwort !== 'interessiert' && z.antwort !== 'abgesagt');

  if (ergebnis) {
    return <Wege ergebnis={ergebnis} setErgebnis={setErgebnis} empf={empf} fertig={fertig} />;
  }

  return (
    <div className="card" style={{ margin: '12px 0' }}>
      <h3>Profile vorlegen</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        Anonyme Kurzprofile mit Tagessatz und einer Einschätzung zur Anfrage. Der Kunde bekommt
        einen Link, braucht aber kein Konto.
      </p>
      {fehler && <div className="msg msg-error">{fehler}</div>}

      <div style={{ margin: '12px 0', fontSize: 13.5 }}>
        {zeilen.map((z) => (
          <div key={z.id} style={{ padding: '3px 0' }}>
            <strong>{z.vorname} {z.nachname}</strong>{' '}
            <span className="muted">{z.berufsbezeichnung?.split('—')[0]}</span>
            {z.antwort === 'interessiert' && (
              <span className="status status-freigegeben" style={{ marginLeft: 6 }}>hat zugesagt</span>
            )}
            {z.antwort === 'abgesagt' && (
              <span className="status status-inaktiv" style={{ marginLeft: 6 }}>hat abgesagt</span>
            )}
          </div>
        ))}
      </div>

      {abgesagt.length > 0 && (
        <div className="msg msg-error" style={{ fontSize: 13 }}>
          {abgesagt.length === 1 ? 'Einer der Gewählten hat abgesagt' : `${abgesagt.length} der Gewählten haben abgesagt`}.
          Ein abgesagtes Profil vorzulegen kostet beim Kunden mehr, als es bringt.
        </div>
      )}
      {abgesagt.length === 0 && ohneZusage.length > 0 && (
        <p className="muted" style={{ fontSize: 12.5 }}>
          {ohneZusage.length === 1 ? 'Einer hat' : `${ohneZusage.length} haben`} noch nicht zugesagt. Du kannst
          trotzdem vorlegen, nur weißt du dann nicht, ob er noch zu haben ist.
        </p>
      )}

      {/* Alles außer dem Aufschlag ist freiwillig. Kam die Anfrage über
          LinkedIn oder im Gespräch, gibt es keine Mailadresse, und dann ist
          der Link der Weg. Eine Pflichtangabe für einen Fall, den es oft
          nicht gibt, wäre eine Hürde ohne Nutzen. */}
      <p className="muted" style={{ fontSize: 12.5, margin: '14px 0 4px' }}>
        Empfänger, alles freiwillig. Den Namen für die Anrede, die Mailadresse nur, wenn du
        direkt aus dem System verschicken willst.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 200px' }}><label>Firma</label>
          <input value={empf.firma} onChange={(e) => setEmpf({ ...empf, firma: e.target.value })} placeholder="SOLCOM" /></div>
        <div className="field" style={{ flex: '1 1 180px' }}><label>Name</label>
          <input value={empf.name} onChange={(e) => setEmpf({ ...empf, name: e.target.value })} placeholder="Herr Knobelspies" /></div>
        <div className="field" style={{ flex: '1 1 200px' }}><label>E-Mail</label>
          <input type="email" value={empf.email} onChange={(e) => setEmpf({ ...empf, email: e.target.value })}
            placeholder="nur für den Direktversand" /></div>
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
          disabled={busy || !zeilen.length} onClick={async () => {
            setBusy(true); setFehler('');
            try {
              const d = await api.post('/api/vorlagen', {
                project_id: Number(projektId),
                expert_ids: zeilen.map((z) => z.expert_id),
                empfaenger: { firma: empf.firma || null, name: empf.name || null, email: empf.email || null },
                aufschlag_prozent: aufschlag,
                anschreiben: anschreiben || null,
              });
              setErgebnis({ id: d.vorlage.id, message: d.message, link: null,
                profile: d.positionen.length, aufschlag: d.vorlage.aufschlag_prozent,
                hinweise: d.hinweise || [] });
            } catch (e) { setFehler(e.message); } finally { setBusy(false); }
          }}>
          {busy ? 'Baut…' : `${zeilen.length} ${zeilen.length === 1 ? 'Profil' : 'Profile'} zusammenstellen`}
        </button>
        <button type="button" className="tab" style={{ color: 'var(--grey-600)' }}
          onClick={abbrechen}>Abbrechen</button>
      </div>
    </div>
  );
}

/**
 * v1.47.0 — Drei Wege zum Kunden.
 *
 * Vorher gab es einen: freigeben, Link kopieren. Das passt, wenn die Anfrage
 * per Mail kam. Kam sie über LinkedIn, braucht man nur den Link. Kam sie im
 * Gespräch, will man ein PDF anhängen.
 *
 * Also alle drei nebeneinander, und keiner davon ist der Hauptweg.
 */
function Wege({ ergebnis, setErgebnis, empf, fertig }) {
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [msg, setMsg] = useState('');
  const [mailAn, setMailAn] = useState(empf.email || '');
  const [mailOffen, setMailOffen] = useState(false);

  const freigeben = async () => {
    const d = await api.post(`/api/vorlagen/${ergebnis.id}/freigeben`, {});
    setErgebnis((e) => ({ ...e, link: d.link }));
    return d.link;
  };

  return (
    <div className="card" style={{ margin: '12px 0', borderLeft: '3px solid var(--success)' }}>
      <h3>{ergebnis.profile} Profile stehen bereit</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        Aufschlag {ergebnis.aufschlag} Prozent. Such dir aus, wie der Kunde sie bekommt.
      </p>
      {fehler && <div className="msg msg-error">{fehler}</div>}
      {msg && <div className="msg msg-success">{msg}</div>}

      {/* v1.47.1: Was beim Bauen aufgefallen ist. Ein Satz von 175 EUR am Tag
          ist ein Stundensatz im falschen Feld, und das soll man sehen, bevor
          die Vorlage hinausgeht. */}
      {ergebnis.hinweise?.length > 0 && (
        <div className="notice" style={{ marginTop: 10 }}>
          <strong>Bitte vorher ansehen:</strong>
          <ul style={{ margin: '6px 0 0 18px' }}>
            {ergebnis.hinweise.map((h) => <li key={h}>{h}</li>)}
          </ul>
        </div>
      )}

      {/* Weg 1: der Link */}
      <div style={{ borderTop: '1px solid var(--grey-200)', paddingTop: 12, marginTop: 12 }}>
        <strong style={{ fontSize: 14 }}>Link</strong>
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
          Zum Weitergeben, auch über LinkedIn oder im Chat. Kein Konto nötig.
        </p>
        {ergebnis.link ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{ergebnis.link}</code>
            <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ergebnis.link);
                  setMsg('Link kopiert.');
                } catch { setFehler('Kopieren ging nicht, bitte von Hand markieren.'); }
              }}>Kopieren</button>
            <a href={ergebnis.link} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Ansehen</a>
          </div>
        ) : (
          <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px', marginBottom: 0 }}
            disabled={busy} onClick={async () => {
              setBusy(true); setFehler('');
              try {
                const link = await freigeben();
                await navigator.clipboard.writeText(link).catch(() => {});
                setMsg('Link gilt ab jetzt und ist kopiert.');
              } catch (e) { setFehler(e.message); } finally { setBusy(false); }
            }}>Link erzeugen und kopieren</button>
        )}
      </div>

      {/* Weg 2: das PDF */}
      <div style={{ borderTop: '1px solid var(--grey-200)', paddingTop: 12, marginTop: 12 }}>
        <strong style={{ fontSize: 14 }}>PDF</strong>
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
          Alle Profile in einem Dokument, je eines auf einer Seite. Zum Anhängen oder Ausdrucken.
        </p>
        <a className="btn" style={{ width: 'auto', padding: '8px 16px', textDecoration: 'none', display: 'inline-block' }}
          href={`/api/vorlagen/${ergebnis.id}/alle.pdf`}>
          <Download size={15} style={{ verticalAlign: '-2px' }} /> PDF herunterladen
        </a>
      </div>

      {/* Weg 3: die Mail */}
      <div style={{ borderTop: '1px solid var(--grey-200)', paddingTop: 12, marginTop: 12 }}>
        <strong style={{ fontSize: 14 }}>Mail</strong>
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
          Direkt aus dem System, mit Link und PDF im Anhang.
        </p>
        {!mailOffen ? (
          <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
            onClick={() => setMailOffen(true)}>
            <Send size={14} style={{ verticalAlign: '-2px' }} /> Per Mail verschicken
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 260px', marginBottom: 0 }}>
              <label>An</label>
              <input type="email" value={mailAn} onChange={(e) => setMailAn(e.target.value)}
                placeholder="vorname.name@firma.de" />
            </div>
            <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px', marginBottom: 0 }}
              disabled={busy || !mailAn} onClick={async () => {
                setBusy(true); setFehler('');
                try {
                  const d = await api.post(`/api/vorlagen/${ergebnis.id}/versenden`, {
                    email: mailAn,
                    anrede: empf.name ? `Guten Tag ${empf.name}` : null,
                  });
                  setErgebnis((e) => ({ ...e, link: d.link }));
                  setMsg(d.message);
                  setMailOffen(false);
                } catch (e) { setFehler(e.message); } finally { setBusy(false); }
              }}>{busy ? 'Schickt…' : 'Abschicken'}</button>
            <button type="button" className="tab" style={{ color: 'var(--grey-600)' }}
              onClick={() => setMailOffen(false)}>Abbrechen</button>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--grey-200)', paddingTop: 12, marginTop: 12 }}>
        <button type="button" className="tab" style={{ color: 'var(--grey-600)' }} onClick={fertig}>Fertig</button>
      </div>
    </div>
  );
}
