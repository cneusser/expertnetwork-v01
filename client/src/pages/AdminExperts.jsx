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

  useEffect(() => {
    api.get('/api/experts').then((d) => setExperts(d.experts)).catch((e) => setError(e.message));
  }, []);

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
          <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}><label>Vorname</label><input name="vorname" required /></div>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}><label>Nachname</label><input name="nachname" required /></div>
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
      </div>
      {error && <div className="msg msg-error">{error}</div>}
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
      {experts && (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Rolle</th><th>Verfügbarkeit</th><th>Frische</th><th>Tagessatz</th><th>Skills</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {experts
              .filter((e) => statusFilter === 'alle' || e.status === statusFilter)
              .filter((e) => !nurUnbestaetigt || e.freshness?.nichtBestaetigt)
              .map((e) => (
              <tr key={e.id}>
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
