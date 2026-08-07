import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRound, CalendarClock, Euro, FileText, HeartHandshake, Receipt } from 'lucide-react';
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
  const [mandate, setMandate] = useState([]);
  const ladeMandate = () => api.get('/api/billing/meine-mandate').then((d) => setMandate(d.mandate)).catch(() => {});

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
  useEffect(() => { load(); ladeMandate(); api.get('/api/experts/me/dashboard').then(setDash).catch(() => {}); }, []);

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
    { icon: FileText, title: tr(lang, 'Dokumente', 'Documents'), desc: tr(lang, 'Lebenslauf, Zertifikate und Referenzen, versioniert und selbst hochladbar.', 'CV, certificates and references, versioned and self-uploaded.'), link: '/profil' },
    { icon: HeartHandshake, title: tr(lang, 'Assoziierte Partner', 'Associated partners'), desc: tr(lang, 'Eigenes Netzwerk? Verdiene an Empfehlungen, Projekten und gemeinsamer Umsetzung mit.', 'A network of your own? Earn a share from referrals, projects and joint delivery.'), link: '/partner' },
  ];

  return (
    <Layout>
      <h1>{tr(lang, 'Willkommen', 'Welcome')}</h1>
      <p className="sub">{tr(lang, 'Dein Bereich im Phalanx Expert Network.', 'Your area in the Phalanx Expert Network.')}</p>
      {dash && (
        <div className="kpi-row">
          <div className="kpi"><div className="num">{dash.vollstaendigkeit} %</div><div className="lbl">{tr(lang, 'Profil-Vollständigkeit', 'Profile completeness')}</div></div>
          <div className="kpi"><div className="num">{dash.offene_projekte}</div><div className="lbl">{tr(lang, 'Offene Projekte', 'Open projects')}</div></div>
          <div className="kpi"><div className="num">{dash.empfohlene_projekte}</div><div className="lbl">{tr(lang, 'Für dich empfohlen (≥ 60 % Match)', 'Recommended for you (≥ 60 % match)')}</div></div>
          <div className="kpi"><div className="num">{dash.bewerbungen}</div><div className="lbl">{tr(lang, 'Meine Bewerbungen', 'My applications')}</div></div>
          <div className="kpi"><div className="num">{dash.profil_views}</div><div className="lbl">{tr(lang, 'Profilaufrufe durch Phalanx', 'Profile views by Phalanx')}</div></div>
        </div>
      )}
      {dash && dash.vollstaendigkeit < 100 && (
        <div className="notice">
          {tr(lang, 'Vervollständige dein Profil für bessere Projektvorschläge, es fehlt: ', 'Complete your profile for better project matches, still missing: ')}
          {Object.entries(dash.checks).filter(([, ok]) => !ok).map(([k]) => ({
            kurzprofil: tr(lang, 'Kurzprofil', 'Summary'), kontakt: tr(lang, 'Telefon/Mobil', 'Phone/mobile'), adresse: tr(lang, 'Adresse', 'Address'), skills: tr(lang, 'mind. 5 Skills', 'at least 5 skills'),
            tagessatz: tr(lang, 'Tagessatz', 'Daily rate'), verfuegbarkeit: tr(lang, 'Verfügbarkeit', 'Availability'), cv_dokument: 'CV-Upload',
            ausbildung: tr(lang, 'Ausbildung', 'Education'), stationen: tr(lang, 'Karrierestationen', 'Career steps'), sprachen: tr(lang, 'Sprachen', 'Languages'),
          }[k])).join(', ')}.
        </div>
      )}
      {!user?.isApproved && (
        <div className="notice">
          {tr(lang, 'Dein Zugang wartet auf die Freigabe durch die Phalanx GmbH. Du bekommst eine E-Mail, sobald dein Profil freigeschaltet ist.', 'Your access is awaiting approval by Phalanx GmbH. We will notify you by email as soon as your profile is activated.')}
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
            {tr(lang, 'Alle 14 Tage erinnern wir dich per E-Mail mit einem Ein-Klick-Bestätigungslink.', 'Every 14 days we send you an email with a one-click confirmation link.')}
          </p>
        </div>
      )}

      {mandate.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3><Receipt size={17} /> {tr(lang, 'Meine Mandate und Tage', 'My mandates and days')}</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            {tr(lang, 'Trag hier am Monatsende deine Tage ein und reich sie ein. Danach rechnen wir ab, du musst uns keine eigene Rechnung schicken.',
              'Enter your days at the end of the month and submit them. We take care of the billing, no invoice needed from you.')}
          </p>
          {mandate.map((m) => (
            <MandatZeile key={m.id} m={m} lang={lang} onSaved={(t) => { setMsg({ ok: true, text: t }); ladeMandate(); }}
              onError={(t) => setMsg({ ok: false, text: t })} />
          ))}
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

/** v1.23.0 — Zeiterfassung je Mandat: Tage eintragen und einreichen. */
function MandatZeile({ m, lang, onSaved, onError }) {
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7));
  const [tage, setTage] = useState('');
  const [spesen, setSpesen] = useState('');
  const gesperrt = ['freigegeben', 'abgerechnet'];

  const senden = async (einreichen) => {
    try {
      const d = await api.post('/api/billing/nachweis', {
        engagement_id: m.id, periode, tage: Number(String(tage).replace(',', '.')) || 0,
        spesen_eur: Number(spesen) || 0, einreichen,
      });
      setTage(''); setSpesen('');
      onSaved(d.message);
    } catch (e) { onError(e.message); }
  };

  return (
    <div style={{ borderTop: '1px solid var(--grey-200, #e3e6ea)', paddingTop: 10, marginTop: 10 }}>
      <strong>{m.projekt_name}</strong>{' '}
      <span className="muted" style={{ fontSize: 13 }}>{m.tagessatz_experte_eur} EUR {tr(lang, 'je Tag', 'per day')}</span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 6 }}>
        <div className="field" style={{ flex: '0 0 130px', marginBottom: 0 }}>
          <label>{tr(lang, 'Zeitraum', 'Period')}</label>
          <input type="month" value={periode} onChange={(e) => setPeriode(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '0 0 90px', marginBottom: 0 }}>
          <label>{tr(lang, 'Tage', 'Days')}</label>
          <input type="text" value={tage} onChange={(e) => setTage(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '0 0 110px', marginBottom: 0 }}>
          <label>{tr(lang, 'Spesen (EUR)', 'Expenses (EUR)')}</label>
          <input type="text" value={spesen} onChange={(e) => setSpesen(e.target.value)} />
        </div>
        <button type="button" className="tab" style={{ color: 'var(--navy)', paddingBottom: 10 }} onClick={() => senden(false)}>
          {tr(lang, 'Speichern', 'Save')}
        </button>
        <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => senden(true)}>
          {tr(lang, 'Einreichen', 'Submit')}
        </button>
      </div>
      {m.nachweise.length > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {m.nachweise.slice(0, 6).map((n) => (
            <span key={n.id} style={{ marginRight: 12 }}>
              {n.periode}: {String(n.tage).replace('.', ',')} {tr(lang, 'Tage', 'days')}
              {gesperrt.includes(n.status) ? ` (${tr(lang, 'freigegeben', 'approved')})` : ` (${n.status})`}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
