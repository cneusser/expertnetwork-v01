/** v1.8.0 — Mailvorlagen einsehen/anpassen + Outbox (Protokoll aller ausgehenden Mails). */
import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const STATUS_LABEL = { gesendet: 'Gesendet', fehler: 'Fehler', stub: 'Testmodus (nicht versendet)' };

/** v1.15.0 — Popup-Overlay für Mail-Vorschauen (Outbox + Posteingang). */
function Modal({ onClose, children }) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,42,74,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="card"
        style={{ width: 'min(720px, 96vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        {children}
      </div>
    </div>
  );
}

function VorlagenTab() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState({});

  const load = () => api.get('/api/mails/templates').then((d) => {
    setData(d);
    setEdit(Object.fromEntries(d.templates.map((t) => [t.key, { subject: t.subject, body_text: t.body_text }])));
  });
  useEffect(() => { load(); }, []);
  if (!data) return <p className="sub">Laden…</p>;

  return (
    <>
      <p className="muted" style={{ margin: '6px 0 14px' }}>
        Verfügbare Platzhalter: {data.platzhalter.join(' · ')} — {'{{link}}'} wird in der Mail zum Button.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
      {data.templates.map((t) => (
        <div className="card" key={t.key} style={{ marginBottom: 16 }}>
          <h3>{t.name} {t.angepasst && <span className="badge badge-active">angepasst</span>}</h3>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Betreff</label>
            <input value={edit[t.key]?.subject || ''} onChange={(e) => setEdit({ ...edit, [t.key]: { ...edit[t.key], subject: e.target.value } })} />
          </div>
          <div className="field">
            <label>Text</label>
            <textarea rows={12} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }}
              value={edit[t.key]?.body_text || ''}
              onChange={(e) => setEdit({ ...edit, [t.key]: { ...edit[t.key], body_text: e.target.value } })} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" style={{ width: 'auto' }}
              onClick={async () => {
                setMsg(null);
                try { const d = await api.put(`/api/mails/templates/${t.key}`, edit[t.key]); setMsg({ ok: true, text: d.message }); load(); }
                catch (e) { setMsg({ ok: false, text: e.message }); }
              }}>Speichern</button>
            <button className="btn" style={{ width: 'auto', background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}
              onClick={async () => {
                setMsg(null);
                try { const d = await api.post(`/api/mails/templates/${t.key}/test`); setMsg({ ok: true, text: d.message }); }
                catch (e) { setMsg({ ok: false, text: e.message }); }
              }}>Testmail an mich</button>
            {t.angepasst && (
              <button className="btn" style={{ width: 'auto', background: 'transparent', color: 'var(--danger)', border: '1px solid var(--grey-200)' }}
                onClick={async () => {
                  if (!window.confirm('Eigene Fassung verwerfen und Standardtext wiederherstellen?')) return;
                  const d = await api.post(`/api/mails/templates/${t.key}/reset`); setMsg({ ok: true, text: d.message }); load();
                }}>Auf Standard zurücksetzen</button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function PosteingangTab() {
  const [data, setData] = useState(null);
  const [offen, setOffen] = useState(null);
  const [antwort, setAntwort] = useState('');
  const [msg, setMsg] = useState(null);
  const load = () => api.get('/api/mails/inbox').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <p className="sub">Laden…</p>;
  return (
    <>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
      <table className="table">
        <thead><tr><th>Datum</th><th>Von</th><th>Betreff</th><th>Status</th></tr></thead>
        <tbody>
          {data.inbox.map((r) => (
            <tr key={r.id} style={{ cursor: 'pointer', fontWeight: r.gelesen ? 400 : 700 }}
              onClick={async () => { setMsg(null); setAntwort(''); setOffen((await api.get(`/api/mails/inbox/${r.id}`)).mail); load(); }}>
              <td>{new Date(r.created_at).toLocaleString('de-DE')}</td>
              <td>{r.from_name || r.from_email}
                {r.expert_id && <> <a href={`/admin/experten/${r.expert_id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12 }}>Profil</a></>}</td>
              <td>{r.subject || '(kein Betreff)'}</td>
              <td>{r.beantwortet_at ? <span className="status status-freigegeben">Beantwortet</span>
                : r.gelesen ? 'Gelesen' : <span className="status status-eingeladen">Neu</span>}</td>
            </tr>
          ))}
          {!data.inbox.length && <tr><td colSpan={4} className="muted">
            Noch keine eingehenden Mails. Sobald der Brevo-Inbound-Webhook eingerichtet ist, landen Antworten hier.</td></tr>}
        </tbody>
      </table>
      {offen && (
        <Modal onClose={() => setOffen(null)}>
          <h3>{offen.subject || '(kein Betreff)'}
            <button className="tab" style={{ float: 'right' }} onClick={() => setOffen(null)}>Schließen</button></h3>
          <p className="muted" style={{ fontSize: 12 }}>Von {offen.from_name || ''} &lt;{offen.from_email}&gt; · {new Date(offen.created_at).toLocaleString('de-DE')}</p>
          {offen.body_html
            ? <iframe title="Mail" srcDoc={offen.body_html} style={{ width: '100%', height: 300, border: '1px solid var(--grey-200)', borderRadius: 6, background: '#fff' }} />
            : <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14 }}>{offen.body_text || '(kein Inhalt)'}</pre>}
          <div className="field" style={{ marginTop: 12 }}>
            <label>Antwort</label>
            <textarea rows={5} value={antwort} onChange={(e) => setAntwort(e.target.value)} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14 }} />
          </div>
          <button className="btn" style={{ width: 'auto' }} disabled={antwort.trim().length < 2}
            onClick={async () => {
              try {
                const d = await api.post(`/api/mails/inbox/${offen.id}/antwort`, { text: antwort });
                setMsg({ ok: true, text: d.message }); setOffen(null); load();
              } catch (e) { setMsg({ ok: false, text: e.message }); }
            }}>Antwort senden</button>
        </Modal>
      )}
    </>
  );
}

function RundmailTab() {
  const [status, setStatus] = useState('freigegeben');
  const [anzahl, setAnzahl] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/api/mails/rundmail/empfaenger?status=${status}`).then((d) => setAnzahl(d.anzahl)); }, [status]);
  return (
    <div className="card">
      <h3>Rundmail an ein Segment</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Geht ausschließlich an Experten mit aktiver Einwilligung. Platzhalter: {'{{vorname}}'} und {'{{nachname}}'}.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
      <div className="field" style={{ marginTop: 10, maxWidth: 320 }}>
        <label>Empfängerkreis</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="freigegeben">Freigegebene Experten</option>
          <option value="alle">Alle mit Einwilligung</option>
        </select>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{anzahl === null ? '…' : `${anzahl} Empfänger`}</p>
      </div>
      <div className="field"><label>Betreff</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="field"><label>Text</label>
        <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }} /></div>
      <button className="btn" style={{ width: 'auto' }} disabled={busy || !subject || !body || !anzahl}
        onClick={async () => {
          if (!window.confirm(`Rundmail jetzt an ${anzahl} Empfänger senden?`)) return;
          setBusy(true); setMsg(null);
          try {
            const d = await api.post('/api/mails/rundmail', { status, subject, body_text: body });
            setMsg({ ok: true, text: d.message + (d.fehler.length ? ` Fehler: ${d.fehler.join('; ')}` : '') });
            setSubject(''); setBody('');
          } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
        }}>
        {busy ? 'Wird versendet…' : 'Rundmail senden'}
      </button>
    </div>
  );
}

function OutboxTab() {
  const [rows, setRows] = useState(null);
  const [vorschau, setVorschau] = useState(null);
  useEffect(() => { api.get('/api/mails/outbox').then((d) => setRows(d.outbox)); }, []);
  if (!rows) return <p className="sub">Laden…</p>;
  return (
    <>
      <table className="table">
        <thead><tr><th>Datum</th><th>An</th><th>Betreff</th><th>Vorlage</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ cursor: 'pointer' }}
              onClick={async () => setVorschau((await api.get(`/api/mails/outbox/${r.id}`)).mail)}>
              <td>{new Date(r.created_at).toLocaleString('de-DE')}</td>
              <td>{r.to_email}</td>
              <td>{r.subject}</td>
              <td>{r.template_key || '—'}</td>
              <td>
                <span className={`status status-${r.status === 'gesendet' ? 'freigegeben' : r.status === 'fehler' ? 'inaktiv' : 'eingeladen'}`}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
                {r.fehler && <div className="muted" style={{ fontSize: 11 }}>{r.fehler}</div>}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="muted">Noch keine Mails versendet.</td></tr>}
        </tbody>
      </table>
      {vorschau && (
        <Modal onClose={() => setVorschau(null)}>
          <h3>Vorschau: {vorschau.subject}
            <button className="tab" style={{ float: 'right' }} onClick={() => setVorschau(null)}>Schließen</button></h3>
          <p className="muted" style={{ fontSize: 12 }}>An {vorschau.to_email} · {new Date(vorschau.created_at).toLocaleString('de-DE')}</p>
          {vorschau.body_html
            ? <iframe title="Mailvorschau" srcDoc={vorschau.body_html} style={{ width: '100%', height: 420, border: '1px solid var(--grey-200)', borderRadius: 6, background: '#fff' }} />
            : <p className="muted">Kein HTML-Inhalt protokolliert.</p>}
        </Modal>
      )}
    </>
  );
}

export default function AdminMails() {
  const [tab, setTab] = useState('vorlagen');
  return (
    <Layout>
      <h1><Mail size={22} style={{ verticalAlign: '-3px' }} /> Mails</h1>
      <p className="sub">Einladungs-Vorlagen anpassen und jeden Versand nachvollziehen.</p>
      <p style={{ margin: '0 0 16px', display: 'flex', gap: 8 }}>
        {[['vorlagen', 'Vorlagen'], ['posteingang', 'Posteingang'], ['rundmail', 'Rundmail'], ['outbox', 'Outbox']].map(([k, label]) => (
          <button key={k} type="button" className="tag"
            style={{ cursor: 'pointer', border: 'none', background: tab === k ? 'var(--navy)' : undefined, color: tab === k ? '#fff' : undefined }}
            onClick={() => setTab(k)}>{label}</button>
        ))}
      </p>
      {tab === 'vorlagen' ? <VorlagenTab /> : tab === 'posteingang' ? <PosteingangTab /> : tab === 'rundmail' ? <RundmailTab /> : <OutboxTab />}
    </Layout>
  );
}
