/**
 * v1.42.0 — Projektanfragen: einfügen, prüfen, übernehmen.
 *
 * Drei Schritte, und der mittlere ist der wichtigste. Was die Maschine
 * gelesen hat, steht hier zum Korrigieren, bevor daraus ein Projekt wird.
 * Fehlende Angaben stehen als Lücke da und nicht als erfundene Zahl: Ein
 * Tagessatz, den niemand genannt hat, ist keine Information.
 */
import { useEffect, useState } from 'react';
import { Inbox, Upload, Check, X, FileText, AlertTriangle } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const heute = new Date().toISOString().slice(0, 10);

export default function AdminAnfragen() {
  const [liste, setListe] = useState(null);
  const [status, setStatus] = useState('neu');
  const [text, setText] = useState('');
  const [entwurf, setEntwurf] = useState(null);
  const [doppelt, setDoppelt] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const laden = () => api.get(`/api/anfragen?status=${status}`)
    .then((d) => setListe(d.anfragen)).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { laden(); }, [status]);

  const lesen = async (datei = null) => {
    setBusy(true); setMsg(null); setDoppelt(null);
    try {
      let d;
      if (datei) {
        const fd = new FormData();
        fd.append('datei', datei);
        d = await api.upload('/api/anfragen', fd);
      } else {
        d = await api.post('/api/anfragen', { text });
      }
      setEntwurf({ id: d.anfrage.id, ...d.anfrage.gelesen, luecken: d.anfrage.luecken, oeffnen: true });
      setDoppelt(d.doppelt);
      setMsg({ ok: true, text: d.message });
      setText('');
      await laden();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  const feld = (name, wert) => setEntwurf((a) => ({ ...a, [name]: wert }));

  return (
    <Layout>
      <h1><Inbox size={22} style={{ verticalAlign: '-3px' }} /> Anfragen</h1>
      <p className="sub">
        Projektanfragen kommen in jedem Format. Text einfügen oder Datei hochladen, prüfen,
        übernehmen. Erst beim Übernehmen entsteht ein Projekt, und angeschrieben wird niemand,
        bevor du die Treffer gesehen hast.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {!entwurf && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3>Neue Anfrage</h3>
          <div className="field">
            <label>Anfrage einfügen</label>
            <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Die Mail des Vermittlers oder die Projektbeschreibung hier hineinkopieren, mitsamt Betreff und Grußformel. Je mehr dasteht, desto mehr wird erkannt." />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn" style={{ width: 'auto', padding: '9px 18px', marginBottom: 0 }}
              disabled={busy || text.trim().length < 20} onClick={() => lesen()}>
              {busy ? 'Liest…' : 'Lesen'}
            </button>
            <span className="muted">oder</span>
            <label className="tab" style={{ cursor: 'pointer', color: 'var(--navy)' }}>
              <Upload size={15} style={{ verticalAlign: '-2px' }} /> Datei hochladen
              <input type="file" accept=".pdf,.docx,.txt,.md,.eml" style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files?.[0]) lesen(e.target.files[0]); e.target.value = ''; }} />
            </label>
            <span className="muted" style={{ fontSize: 12.5 }}>PDF, Word oder Text</span>
          </div>
        </div>
      )}

      {entwurf && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--pxl-gold, #c9a96e)' }}>
          <h3>Gelesen, bitte prüfen</h3>

          {doppelt && (
            <div className="notice" style={{ marginBottom: 12 }}>
              Dieselbe Referenz kam schon einmal herein, am{' '}
              {new Date(doppelt.am).toLocaleDateString('de-DE')} ({doppelt.status}). Entweder ist die
              Suche neu aufgelegt worden, oder der Vermittler schickt die Rundmail ein zweites Mal.
            </div>
          )}

          {entwurf.luecken?.length > 0 && (
            <div className="msg msg-error" style={{ marginBottom: 12 }}>
              <AlertTriangle size={15} style={{ verticalAlign: '-2px' }} /> <strong>Nicht erkannt:</strong>
              <ul style={{ margin: '6px 0 0 18px' }}>
                {entwurf.luecken.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
          )}

          <div className="field">
            <label>Titel</label>
            <input value={entwurf.titel || ''} onChange={(e) => feld('titel', e.target.value)} />
          </div>
          <div className="field">
            <label>Beschreibung</label>
            <textarea rows={3} value={entwurf.beschreibung || ''} onChange={(e) => feld('beschreibung', e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 150px' }}><label>Start</label>
              <input type="date" value={entwurf.start || ''} min={heute.slice(0, 4)}
                onChange={(e) => feld('start', e.target.value || null)} /></div>
            <div className="field" style={{ flex: '1 1 130px' }}><label>Dauer</label>
              <input value={entwurf.dauer || ''} onChange={(e) => feld('dauer', e.target.value)} placeholder="1 Jahr" /></div>
            <div className="field" style={{ flex: '1 1 130px' }}><label>Auslastung</label>
              <input value={entwurf.auslastung || ''} onChange={(e) => feld('auslastung', e.target.value)} placeholder="100 %" /></div>
            <div className="field" style={{ flex: '1 1 140px' }}><label>Arbeitsmodell</label>
              <select value={entwurf.arbeitsmodell || ''} onChange={(e) => feld('arbeitsmodell', e.target.value || null)}>
                <option value="">offen</option>
                <option value="remote">remote</option>
                <option value="hybrid">hybrid</option>
                <option value="vor_ort">vor Ort</option>
              </select></div>
            <div className="field" style={{ flex: '1 1 140px' }}><label>Ort</label>
              <input value={entwurf.ort || ''} onChange={(e) => feld('ort', e.target.value)} /></div>
            <div className="field" style={{ flex: '1 1 150px' }}>
              <label>Tagessatz bis</label>
              <input type="number" value={entwurf.tagessatz_bis_eur ?? ''}
                onChange={(e) => feld('tagessatz_bis_eur', e.target.value ? Number(e.target.value) : null)}
                placeholder="nicht genannt" />
            </div>
          </div>

          <Begriffe titel="Must-haves" werte={entwurf.must || []} setzen={(v) => feld('must', v)} />
          <Begriffe titel="Nice-to-have" werte={entwurf.nice || []} setzen={(v) => feld('nice', v)} />
          <Begriffe titel="Suchbegriffe fürs Matching" werte={entwurf.skills || []} setzen={(v) => feld('skills', v)}
            hinweis="Danach wird im Pool gesucht. Neue Begriffe werden angelegt und stehen beim nächsten Mal bereit." />

          <label style={{ display: 'block', margin: '12px 0', fontSize: 13.5 }}>
            <input type="checkbox" checked={entwurf.oeffnen !== false}
              onChange={(e) => feld('oeffnen', e.target.checked)} style={{ marginRight: 8 }} />
            Direkt auf offen setzen, damit das Matching sofort läuft
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn" style={{ width: 'auto', padding: '9px 18px', marginBottom: 0 }}
              disabled={busy || !entwurf.titel} onClick={async () => {
                setBusy(true);
                try {
                  const d = await api.post(`/api/anfragen/${entwurf.id}/uebernehmen`, {
                    titel: entwurf.titel, beschreibung: entwurf.beschreibung || null,
                    ort: entwurf.ort || null, arbeitsmodell: entwurf.arbeitsmodell || null,
                    start: entwurf.start || null, dauer: entwurf.dauer || null,
                    auslastung: entwurf.auslastung || null,
                    tagessatz_bis_eur: entwurf.tagessatz_bis_eur ?? null,
                    must: entwurf.must || [], nice: entwurf.nice || [], skills: entwurf.skills || [],
                    oeffnen: entwurf.oeffnen !== false,
                  });
                  setMsg({ ok: true, text: `${d.message} Weiter im Projekt.` });
                  setEntwurf(null);
                  await laden();
                  window.location.href = `/admin/projekte/${d.projekt.id}`;
                } catch (e) { setMsg({ ok: false, text: e.message }); }
                finally { setBusy(false); }
              }}>
              <Check size={15} style={{ verticalAlign: '-2px' }} /> Projekt anlegen
            </button>
            <button type="button" className="tab" style={{ padding: 0, color: 'var(--grey-600)' }} disabled={busy}
              onClick={async () => {
                const grund = window.prompt('Warum passt die Anfrage nicht? (steht später in der Auswertung)');
                if (grund === null) return;
                await api.post(`/api/anfragen/${entwurf.id}/ablehnen`, { grund });
                setEntwurf(null); setMsg({ ok: true, text: 'Abgelehnt.' }); await laden();
              }}>
              <X size={15} style={{ verticalAlign: '-2px' }} /> Passt nicht
            </button>
            <button type="button" className="tab" style={{ padding: 0, color: 'var(--grey-600)' }}
              onClick={() => setEntwurf(null)}>Später</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, margin: '18px 0 10px' }}>
        {[['neu', 'Offen'], ['uebernommen', 'Übernommen'], ['abgelehnt', 'Abgelehnt'], ['alle', 'Alle']].map(([k, l]) => (
          <button key={k} type="button" className={`tab ${status === k ? 'tab-aktiv' : ''}`}
            onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>

      {liste && (
        <table className="table">
          <thead><tr><th>Eingang</th><th>Titel</th><th>Von</th><th>Start</th><th>Referenz</th><th>Stand</th></tr></thead>
          <tbody>
            {liste.map((a) => (
              <tr key={a.id}>
                <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                  {new Date(a.created_at).toLocaleDateString('de-DE')}
                  {a.eingang === 'datei' && <><br /><FileText size={12} style={{ verticalAlign: '-1px' }} /> {a.dateiname}</>}
                </td>
                <td>{a.gelesen?.titel || <span className="muted">ohne Titel</span>}
                  {a.luecken?.length > 0 && a.status === 'neu' && (
                    <><br /><span className="muted" style={{ fontSize: 12 }}>{a.luecken.length} Angaben fehlen</span></>
                  )}</td>
                <td style={{ fontSize: 13 }}>{a.absender_firma || a.gelesen?.absender_firma || '—'}
                  {a.absender_name && <><br /><span className="muted">{a.absender_name}</span></>}</td>
                <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  {a.gelesen?.start ? new Date(a.gelesen.start).toLocaleDateString('de-DE') : <span className="muted">—</span>}
                </td>
                <td style={{ fontSize: 13 }}>{a.referenz || '—'}</td>
                <td>
                  {a.status === 'neu' && <span className="status status-eingeladen">offen</span>}
                  {a.status === 'uebernommen' && (
                    <a href={`/admin/projekte/${a.project_id}`}>zum Projekt</a>
                  )}
                  {a.status === 'abgelehnt' && (
                    <span className="muted" title={a.ablehnung_grund || ''}>abgelehnt</span>
                  )}
                </td>
              </tr>
            ))}
            {!liste.length && <tr><td colSpan={6} className="muted">Nichts da.</td></tr>}
          </tbody>
        </table>
      )}
    </Layout>
  );
}

/** Eine Liste von Begriffen zum Ergänzen und Streichen. */
function Begriffe({ titel, werte, setzen, hinweis = null }) {
  const [neu, setNeu] = useState('');
  return (
    <div className="field">
      <label>{titel} <span className="muted">{werte.length}</span></label>
      {hinweis && <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>{hinweis}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {werte.map((w, i) => (
          <span key={`${w}-${i}`} className="tag">
            {w}{' '}
            <button type="button" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => setzen(werte.filter((_, j) => j !== i))} title="streichen">×</button>
          </span>
        ))}
        {!werte.length && <span className="muted" style={{ fontSize: 12.5 }}>nichts erkannt</span>}
      </div>
      <input value={neu} onChange={(e) => setNeu(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && neu.trim()) {
            e.preventDefault(); setzen([...werte, neu.trim()]); setNeu('');
          }
        }}
        placeholder="ergänzen und Eingabetaste" />
    </div>
  );
}
