import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRound, CalendarClock, Euro, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useLang, tr } from '../i18n';
import { api } from '../api/client';

const AVAIL_LABEL = { sofort: 'Sofort verfügbar', ab_datum: 'Verfügbar ab Datum', teilweise: 'Teilweise verfügbar', ausgebucht: 'Ausgebucht' };
const AVAIL_LABEL_EN = { sofort: 'Available now', ab_datum: 'Available from date', teilweise: 'Partially available', ausgebucht: 'Fully booked' };

/** Experten-Dashboard mit Verfügbarkeits-Self-Service (Sprint 2). */
export default function ExpertDashboard() {
  const { user } = useAuth();
  const { lang } = useLang();
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
      setMsg({ ok: true, text: tr(lang, 'Verfügbarkeit aktualisiert, vielen Dank.', 'Availability updated, thank you.') });
      load();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const modules = [
    { icon: UserRound, title: tr(lang, 'Mein Profil', 'My profile'), desc: tr(lang, 'Persönliche Daten, Kurzprofil, Sprachen: selbst pflegen.', 'Personal data, summary, languages: maintained by you.'), link: '/profil' },
    { icon: Euro, title: tr(lang, 'Tagessätze', 'Daily rates'), desc: tr(lang, 'Sätze für Remote, vor Ort, Interim, Projektleitung, Beratung.', 'Rates for remote, on-site, interim, project lead, advisory.'), link: '/profil' },
    { icon: FileText, title: tr(lang, 'Dokumente', 'Documents'), desc: tr(lang, 'Lebenslauf, Zertifikate und Referenzen, versioniert.', 'CV, certificates and references, versioned.'), sprint: tr(lang, 'Upload folgt', 'Upload coming') },
  ];

  return (
    <Layout>
      <h1>{tr(lang, 'Willkommen', 'Welcome')}</h1>
      <p className="sub">{tr(lang, 'Ihr Bereich im Phalanx Expert Network.', 'Your area in the Phalanx Expert Network.')}</p>
      {dash && (
        <div className="kpi-row">
          <div className="kpi"><div className="num">{dash.vollstaendigkeit} %</div><div className="lbl">{tr(lang, 'Profil-Vollständigkeit', 'Profile completeness')}</div></div>
          <div className="kpi"><div className="num">{dash.offene_projekte}</div><div className="lbl">{tr(lang, 'Offene Projekte', 'Open projects')}</div></div>
          <div className="kpi"><div className="num">{dash.empfohlene_projekte}</div><div className="lbl">{tr(lang, 'Für Sie empfohlen (≥ 60 % Match)', 'Recommended for you (≥ 60 % match)')}</div></div>
          <div className="kpi"><div className="num">{dash.bewerbungen}</div><div className="lbl">{tr(lang, 'Meine Bewerbungen', 'My applications')}</div></div>
          <div className="kpi"><div className="num">{dash.profil_views}</div><div className="lbl">{tr(lang, 'Profilaufrufe durch Phalanx', 'Profile views by Phalanx')}</div></div>
        </div>
      )}
      {dash && dash.vollstaendigkeit < 100 && (
        <div className="notice">
          {tr(lang, 'Vervollständigen Sie Ihr Profil für bessere Projektvorschläge, es fehlt: ', 'Complete your profile for better project matches, still missing: ')}
          {Object.entries(dash.checks).filter(([, ok]) => !ok).map(([k]) => ({
            kurzprofil: tr(lang, 'Kurzprofil', 'Summary'), kontakt: tr(lang, 'Telefon/Mobil', 'Phone/mobile'), adresse: tr(lang, 'Adresse', 'Address'), skills: tr(lang, 'mind. 5 Skills', 'at least 5 skills'),
            tagessatz: tr(lang, 'Tagessatz', 'Daily rate'), verfuegbarkeit: tr(lang, 'Verfügbarkeit', 'Availability'), cv_dokument: 'CV-Upload',
            ausbildung: tr(lang, 'Ausbildung', 'Education'), stationen: tr(lang, 'Karrierestationen', 'Career steps'), sprachen: tr(lang, 'Sprachen', 'Languages'),
          }[k])).join(', ')}.
        </div>
      )}
      {!user?.isApproved && (
        <div className="notice">
          {tr(lang, 'Ihr Zugang wartet auf die Freigabe durch die Phalanx GmbH. Sie werden per E-Mail informiert, sobald Ihr Profil freigeschaltet ist.', 'Your access is awaiting approval by Phalanx GmbH. We will notify you by email as soon as your profile is activated.')}
        </div>
      )}

      {me && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3><CalendarClock size={17} /> {tr(lang, 'Meine Verfügbarkeit', 'My availability')}</h3>
          {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
          <form onSubmit={saveAvailability} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
            <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
              <label>{tr(lang, 'Status', 'Status')}</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(lang === 'en' ? AVAIL_LABEL_EN : AVAIL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{tr(lang, 'Ab', 'From')}</label>
              <input type="date" value={form.ab_datum} onChange={(e) => setForm({ ...form, ab_datum: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0, minWidth: 110 }}>
              <label>{tr(lang, 'Auslastung', 'Utilisation')}</label>
              <select value={form.auslastung_prozent} onChange={(e) => setForm({ ...form, auslastung_prozent: e.target.value })}>
                <option value="">—</option>
                {[20, 40, 60, 80, 100].map((p) => <option key={p} value={p}>{p} %</option>)}
              </select>
            </div>
            <button className="btn" style={{ width: 'auto' }}>{tr(lang, 'Aktualisieren', 'Update')}</button>
          </form>
          <p className="muted" style={{ marginTop: 10 }}>
            {tr(lang, 'Alle 14 Tage erinnern wir Sie per E-Mail mit einem Ein-Klick-Bestätigungslink.', 'Every 14 days we send you an email with a one-click confirmation link.')}
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
