import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const AVAIL_LABEL = { sofort: 'Sofort verfügbar', ab_datum: 'Ab Datum', teilweise: 'Teilweise', ausgebucht: 'Ausgebucht' };

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('de-DE') : '';
}

function currentAvailability(avails) {
  if (!avails?.length) return '—';
  const today = new Date().toISOString().slice(0, 10);
  const current = [...avails].reverse().find((a) => !a.ab_datum || a.ab_datum <= today) || avails[0];
  const pct = current.auslastung_prozent ? ` (${current.auslastung_prozent} %)` : '';
  const ab = current.ab_datum && current.ab_datum > today ? ` ab ${fmtDate(current.ab_datum)}` : '';
  return `${AVAIL_LABEL[current.status] || current.status}${pct}${ab}`;
}

export default function AdminExperts() {
  const [experts, setExperts] = useState(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [nurUnbestaetigt, setNurUnbestaetigt] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);
  const [auswahl, setAuswahl] = useState([]);
  const [mailOffen, setMailOffen] = useState(false);
  const [mail, setMail] = useState({ subject: '', body_text: '' });
  const [mailBusy, setMailBusy] = useState(false);
  const [skillVorschlaege, setSkillVorschlaege] = useState([]);
  const ladeVorschlaege = () => api.get('/api/experts/skill-vorschlaege').then((d) => setSkillVorschlaege(d.vorschlaege)).catch(() => {});

  useEffect(() => {
    api.get('/api/experts').then((d) => setExperts(d.experts)).catch((e) => setError(e.message));
    ladeVorschlaege();
  }, []);

  const sichtbar = (experts || [])
    .filter((e) => statusFilter === 'alle' || e.status === statusFilter)
    .filter((e) => !nurUnbestaetigt || e.freshness?.nichtBestaetigt);

  return (
    <Layout>
      <h1><Users size={22} style={{ verticalAlign: '-3px' }} /> Experten</h1>
      <p className="sub">{experts ? `${experts.length} Profil(e) im Pool` : 'Laden…'}</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Neue Experten einladen</h3>
        {inviteMsg && <div className={`msg ${inviteMsg.ok ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 8 }}>{inviteMsg.text}</div>}
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}
          onSubmit={async (ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.target);
            setInviteMsg(null);
            try {
              const d = await api.post('/api/experts/invite-neu', Object.fromEntries(fd));
              setInviteMsg({ ok: true, text: d.message });
              ev.target.reset();
              api.get('/api/experts').then((x) => setExperts(x.experts));
            } catch (err) { setInviteMsg({ ok: false, text: err.message }); }
          }}>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}><label>Vorname</label><input type="text" name="vorname" required /></div>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}><label>Nachname</label><input type="text" name="nachname" required /></div>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 220px' }}><label>E-Mail</label><input name="email" type="email" required /></div>
          <div className="field" style={{ marginBottom: 0, width: 120 }}><label>Sprache</label>
            <select name="sprache" defaultValue="de"><option value="de">Deutsch</option><option value="en">Englisch</option></select></div>
          <button className="btn" style={{ width: 'auto' }}>Einladen</button>
          <label className="btn" style={{ width: 'auto', background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)', cursor: 'pointer' }}>
            Liste einladen (Excel/CSV)
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={async (ev2) => {
                const file = ev2.target.files[0];
                if (!file) return;
                const fd2 = new FormData();
                fd2.append('file', file);
                setInviteMsg(null);
                const res = await fetch('/api/experts/invite-bulk', { method: 'POST', body: fd2, credentials: 'include' });
                const d = await res.json();
                if (!res.ok) { setInviteMsg({ ok: false, text: d.error || 'Upload fehlgeschlagen' }); return; }
                const detail = d.uebersprungen.length
                  ? ` Übersprungen: ${d.uebersprungen.map((u) => `${u.email} (${u.grund})`).join('; ')}`
                  : '';
                setInviteMsg({ ok: true, text: d.message + detail });
                ev2.target.value = '';
                api.get('/api/experts').then((x) => setExperts(x.experts));
              }} />
          </label>
        </form>
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Erwartete Spalten: Vorname, Nachname, E-Mail. Die Einladungsmail sehen und ändern Sie unter „Mails“.
        </p>
        <p style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--grey-200, #e3e6ea)' }}>
          <button type="button" className="btn" style={{ width: 'auto', background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}
            onClick={async () => {
              if (!window.confirm('Alle unbeantworteten Bestandskontakte jetzt freundlich anschreiben?\n\nDanach: Erinnerung nach 7 Tagen, automatische DSGVO-Löschung nach 14 Tagen ohne Rückmeldung. Neue Einladungen laufen automatisch (Erinnerung Tag 7 und 21, Löschung Tag 28).')) return;
              try {
                const d = await api.post('/api/experts/invite-zyklus-start');
                setInviteMsg({ ok: true, text: d.message + (d.fehler.length ? ` Fehler: ${d.fehler.join('; ')}` : '') });
              } catch (err) { setInviteMsg({ ok: false, text: err.message }); }
            }}>
            Bestandskontakte anschreiben (Erinnerungs- und Löschzyklus starten)
          </button>
        </p>
      </div>
      {error && <div className="msg msg-error">{error}</div>}
      {skillVorschlaege.length > 0 && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Skill-Vorschläge zur Freigabe ({skillVorschlaege.length}):</strong>{' '}
          <a href="/admin/skills" style={{ fontWeight: 600 }}>Alle in der Skill-Verwaltung bearbeiten</a>{' · '}
          {skillVorschlaege.map((s) => (
            <span className="tag" key={s.id}>
              {s.name} ({s.kategorie}, {s.verwendungen}×){' '}
              <span style={{ cursor: 'pointer', color: 'var(--navy)', fontWeight: 700 }} title="Freigeben"
                onClick={async () => { await api.post(`/api/experts/skill-vorschlaege/${s.id}`, { aktion: 'freigeben' }); ladeVorschlaege(); }}>✓</span>{' '}
              <span style={{ cursor: 'pointer', color: 'var(--danger)', fontWeight: 700 }} title="Ablehnen (entfernt den Begriff überall)"
                onClick={async () => { await api.post(`/api/experts/skill-vorschlaege/${s.id}`, { aktion: 'ablehnen' }); ladeVorschlaege(); }}>×</span>
            </span>
          ))}
        </div>
      )}
      {experts && (
        <p style={{ margin: '0 0 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {['alle', 'freigegeben', 'eingeladen', 'registriert', 'inaktiv'].map((st) => {
            const n = st === 'alle' ? experts.length : experts.filter((e) => e.status === st).length;
            if (st !== 'alle' && n === 0) return null;
            const aktiv = statusFilter === st;
            return (
              <button key={st} type="button" className="tag"
                style={{ cursor: 'pointer', border: 'none', background: aktiv ? 'var(--navy)' : undefined, color: aktiv ? '#fff' : undefined }}
                onClick={() => setStatusFilter(st)}>
                {st === 'alle' ? 'Alle' : st} ({n})
              </button>
            );
          })}
          <label style={{ fontSize: 13, marginLeft: 8, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={nurUnbestaetigt} onChange={(e) => setNurUnbestaetigt(e.target.checked)} />
            nur „nicht bestätigt“
          </label>
        </p>
      )}
      {experts && auswahl.length > 0 && (
        <p style={{ margin: '0 0 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>{auswahl.length} ausgewählt</strong>
          <button type="button" className="btn" style={{ width: 'auto', padding: '7px 16px' }}
            onClick={() => { setMail({ subject: '', body_text: '' }); setMailOffen(true); }}>Direktmail schreiben</button>
          <button type="button" className="tab" style={{ padding: 0 }} onClick={() => setAuswahl([])}>Auswahl aufheben</button>
        </p>
      )}

      {mailOffen && (
        <div onClick={() => setMailOffen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,42,74,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(680px, 96vw)', maxHeight: '88vh', overflowY: 'auto' }}>
            <h3>Direktmail an {auswahl.length} Empfänger
              <button className="tab" style={{ float: 'right' }} onClick={() => setMailOffen(false)}>Schließen</button></h3>
            <p className="muted" style={{ fontSize: 13 }}>
              Platzhalter: {'{{vorname}}'} und {'{{nachname}}'}. Jede Mail geht einzeln raus und steht danach in der Outbox.
            </p>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Betreff</label>
              <input type="text" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
            </div>
            <div className="field">
              <label>Text</label>
              <textarea rows={10} value={mail.body_text} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }}
                onChange={(e) => setMail({ ...mail, body_text: e.target.value })} />
            </div>
            <button className="btn" style={{ width: 'auto' }} disabled={mailBusy || !mail.subject || !mail.body_text}
              onClick={async () => {
                setMailBusy(true);
                try {
                  const d = await api.post('/api/experts/direktmail', { expert_ids: auswahl, ...mail });
                  setInviteMsg({ ok: true, text: d.message + (d.uebersprungen.length ? ` Übersprungen: ${d.uebersprungen.join('; ')}` : '') });
                  setMailOffen(false); setAuswahl([]);
                } catch (err) { setInviteMsg({ ok: false, text: err.message }); }
                finally { setMailBusy(false); }
              }}>{mailBusy ? 'Wird versendet…' : 'Jetzt senden'}</button>
          </div>
        </div>
      )}

      {experts && (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" title="Alle sichtbaren auswählen"
                  checked={auswahl.length > 0 && sichtbar.length > 0 && auswahl.length === sichtbar.length}
                  onChange={(e) => setAuswahl(e.target.checked ? sichtbar.map((x) => x.id) : [])} />
              </th>
              <th>Name</th><th>Rolle</th><th>Verfügbarkeit</th><th>Frische</th><th>Tagessatz</th><th>Skills</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {sichtbar.map((e) => (
              <tr key={e.id}>
                <td><input type="checkbox" checked={auswahl.includes(e.id)}
                  onChange={(ev) => setAuswahl(ev.target.checked ? [...auswahl, e.id] : auswahl.filter((x) => x !== e.id))} /></td>
                <td><Link to={`/admin/experten/${e.id}`}><strong>{e.vorname} {e.nachname}</strong></Link><br />
                  <span className="muted">{e.firma}</span></td>
                <td>{e.berufsbezeichnung?.split('—')[0]}</td>
                <td>{currentAvailability(e.availabilities)}
                  {e.freshness?.nichtBestaetigt && <><br /><span className="status status-eingeladen">nicht bestätigt</span></>}</td>
                <td><span className={`ampel ampel-${e.freshness?.ampel || 'rot'}`} />{e.freshness?.score ?? 0}</td>
                <td>{e.rates?.length
                  ? e.rates.map((r) => `${r.satz_von_eur}${r.satz_bis_eur ? '–' + r.satz_bis_eur : ''} €`).join(', ')
                  : '—'}</td>
                <td>{(e.skills || []).filter((s) => s.kategorie === 'kompetenz').slice(0, 3).map((s) => (
                  <span className="tag" key={s.name}>{s.name}</span>
                ))}</td>
                <td><span className={`status status-${e.status}`}>{e.status}</span></td>
                <td>
                  <button type="button" title="Profil endgültig löschen (Art. 17 DSGVO)"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger, #b23a48)' }}
                    onClick={async () => {
                      if (!window.confirm(`Experten "${e.vorname} ${e.nachname}" ENDGÜLTIG löschen?\n\nProfil, Konto, Dokumente und Verknüpfungen werden entfernt (Art. 17 DSGVO), Audit-Einträge anonymisiert. Das kann nicht rückgängig gemacht werden.`)) return;
                      try {
                        await api.del(`/api/experts/${e.id}`);
                        setExperts((prev) => prev.filter((x) => x.id !== e.id));
                      } catch (err) { window.alert(err.message); }
                    }}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
