import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
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

  useEffect(() => {
    api.get('/api/experts').then((d) => setExperts(d.experts)).catch((e) => setError(e.message));
  }, []);

  return (
    <Layout>
      <h1><Users size={22} style={{ verticalAlign: '-3px' }} /> Experten</h1>
      <p className="sub">{experts ? `${experts.length} Profil(e) im Pool` : 'Laden…'}</p>
      {error && <div className="msg msg-error">{error}</div>}
      {experts && (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Rolle</th><th>Verfügbarkeit</th><th>Frische</th><th>Tagessatz</th><th>Skills</th><th>Status</th></tr>
          </thead>
          <tbody>
            {experts.map((e) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
