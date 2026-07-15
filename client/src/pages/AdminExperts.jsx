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

  useEffect(() => {
    api.get('/api/experts').then((d) => setExperts(d.experts)).catch((e) => setError(e.message));
  }, []);

  return (
    <Layout>
      <h1><Users size={22} style={{ verticalAlign: '-3px' }} /> Experten</h1>
      <p className="sub">{experts ? `${experts.length} Profil(e) im Pool` : 'Laden…'}</p>
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
