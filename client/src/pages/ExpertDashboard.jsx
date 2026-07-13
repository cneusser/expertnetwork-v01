import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRound, CalendarClock, Euro, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const AVAIL_LABEL = { sofort: 'Sofort verfügbar', ab_datum: 'Verfügbar ab Datum', teilweise: 'Teilweise verfügbar', ausgebucht: 'Ausgebucht' };

/** Experten-Dashboard mit Verfügbarkeits-Self-Service (Sprint 2). */
export default function ExpertDashboard() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [dash, setDash] = useState(null);
  const [form, setForm] = useState({ status: 'sofort', ab_datum: '', auslastung_prozent: '', kommentar: '' });
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/api/experts/me').then((d) => {
    setMe(d);
    const latest = d.availabilities?.[d.availabilities.length - 1];
    if (latest) {
      setForm({
        status: latest.status,
        ab_datum: latest.ab_datum ? latest.ab_datum.slice(0, 10) : '',
        auslastung_prozent: latest.auslastung_prozent || '',
        kommentar: '',
      });
    }
  }).catch(() => setMe(null));
  useEffect(() => { load(); api.get('/api/experts/me/dashboard').then(setDash).catch(() => {}); }, []);

  const saveAvailability = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/api/availability/self', {
        status: form.status,
        ab_datum: form.ab_datum || null,
        auslastung_prozent: form.auslastung_prozent ? Number(form.auslastung_prozent) : null,
        kommentar: form.kommentar || undefined,
      });
      setMsg({ ok: true, text: 'Verfügbarkeit aktualisiert — vielen Dank.' });
      load();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const modules = [
    { icon: UserRound, title: 'Mein Profil', desc: 'Persönliche Daten, Kurzprofil, Sprachen — selbst pflegen.', link: '/profil' },
    { icon: Euro, title: 'Tagessätze', desc: 'Sätze für Remote, vor Ort, Interim, Projektleitung, Beratung.', link: '/profil' },
    { icon: FileText, title: 'Dokumente', desc: 'Lebenslauf, Zertifikate und Referenzen — versioniert.', sprint: 'Upload folgt' },
  ];

  return (
    <Layout>
      <h1>Willkommen</h1>
      <p className="sub">Ihr Bereich im Phalanx Expert Network.</p>
      {dash && (
        <div className="kpi-row">
          <div className="kpi"><div className="num">{dash.vollstaendigkeit} %</div><div className="lbl">Profil-Vollständigkeit</div></div>
          <div className="kpi"><div className="num">{dash.offene_projekte}</div><div className="lbl">Offene Projekte</div></div>
          <div className="kpi"><div className="num">{dash.empfohlene_projekte}</div><div className="lbl">Für Sie empfohlen (≥ 60 % Match)</div></div>
          <div className="kpi"><div className="num">{dash.bewerbungen}</div><div className="lbl">Meine Bewerbungen</div></div>
          <div className="kpi"><div className="num">{dash.profil_views}</div><div className="lbl">Profilaufrufe durch Phalanx</div></div>
        </div>
      )}
      {dash && dash.vollstaendigkeit < 100 && (
        <div className="notice">
          Vervollständigen Sie Ihr Profil für bessere Projektvorschläge — es fehlt:{' '}
          {Object.entries(dash.checks).filter(([, ok]) => !ok).map(([k]) => ({
            kurzprofil: 'Kurzprofil', kontakt: 'Telefon/Mobil', adresse: 'Adresse', skills: 'mind. 5 Skills',
            tagessatz: 'Tagessatz', verfuegbarkeit: 'Verfügbarkeit', cv_dokument: 'CV-Upload',
            ausbildung: 'Ausbildung', stationen: 'Karrierestationen', sprachen: 'Sprachen',
          }[k])).join(', ')}.
        </div>
      )}
      {!user?.isApproved && (
        <div className="notice">
          Ihr Zugang wartet auf die Freigabe durch die Phalanx GmbH. Sie werden
          per E-Mail informiert, sobald Ihr Profil freigeschaltet ist.
        </div>
      )}

      {me && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3><CalendarClock size={17} /> Meine Verfügbarkeit</h3>
          {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
          <form onSubmit={saveAvailability} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
            <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(AVAIL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Ab</label>
              <input type="date" value={form.ab_datum} onChange={(e) => setForm({ ...form, ab_datum: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0, minWidth: 110 }}>
              <label>Auslastung</label>
              <select value={form.auslastung_prozent} onChange={(e) => setForm({ ...form, auslastung_prozent: e.target.value })}>
                <option value="">—</option>
                {[20, 40, 60, 80, 100].map((p) => <option key={p} value={p}>{p} %</option>)}
              </select>
            </div>
            <button className="btn" style={{ width: 'auto' }}>Aktualisieren</button>
          </form>
          <p className="muted" style={{ marginTop: 10 }}>
            Alle 14 Tage erinnern wir Sie per E-Mail mit einem Ein-Klick-Bestätigungslink.
          </p>
        </div>
      )}

      <div className="card-grid">
        {modules.map(({ icon: Icon, title, desc, sprint, link }) => (
          <div className="card" key={title}>
            <h3><Icon size={17} /> {link ? <Link to={link}>{title}</Link> : title}</h3>
            <p>{desc}</p>
            {sprint && <span className="badge">{sprint}</span>}
            {link && <span className="badge badge-active">Aktiv</span>}
          </div>
        ))}
      </div>
    </Layout>
  );
}
