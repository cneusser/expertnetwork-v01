/**
 * v1.18.0 — Öffentliche Landingpage für die Aufnahme ins Netzwerk.
 * Teilbarer Link (experts.phalanx.de/mitmachen) für LinkedIn, Mail und
 * Direktansprache. Texte im Du, ohne Gedankenstriche.
 */
import { Link } from 'react-router-dom';
import { CalendarClock, Euro, ShieldCheck, Target } from 'lucide-react';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';
import { useLang, tr } from '../i18n';

const T = {
  de: {
    titel: 'Werde Teil des Phalanx Expert Network',
    intro: 'Wir bauen ein eigenes Netzwerk aus Interim Managern, Beratern und Fachexperten auf. Kommt ein passendes Mandat, greifen wir direkt darauf zu, ohne Umweg über große Plattformen. Ein Profil, gepflegt von dir, und wir melden uns, wenn es wirklich passt.',
    karten: [
      { icon: Target, titel: 'Passende Mandate', text: 'Unsere Matching-Engine vergleicht Skills, Verfügbarkeit und Tagessatz. Passt ein Projekt zu 60 Prozent oder mehr, bekommst du eine Mail. Sonst hörst du nichts von uns.' },
      { icon: CalendarClock, titel: 'Verfügbarkeit in einem Klick', text: 'Alle 14 Tage fragen wir kurz nach. Ein Klick im Mail genügt, keine Anmeldung nötig. So weiß der Kunde, dass die Angabe frisch ist.' },
      { icon: Euro, titel: 'Deine Konditionen', text: 'Tagessätze, Reisebereitschaft, Arbeitsmodell: alles pflegst du selbst. Wir verhandeln nicht über deinen Kopf hinweg.' },
      { icon: ShieldCheck, titel: 'Daten bleiben deine', text: 'Kein Verkauf, kein Weiterreichen ohne deine Freigabe. Profile gehen nur anonymisiert und nur mit deinem Opt-in an Partner. Einwilligung jederzeit widerrufbar.' },
    ],
    ablaufTitel: 'In fünf Minuten dabei',
    schritte: [
      'Registrieren und E-Mail bestätigen',
      'Kurzprofil, Skills und Tagessatz eintragen, CV hochladen',
      'Verfügbarkeit setzen und passende Projekte erhalten',
    ],
    cta: 'Jetzt Profil anlegen',
    login: 'Ich habe schon ein Konto',
    partner: 'Du hast ein eigenes Netzwerk und willst mitverdienen? Schau dir die assoziierte Partnerschaft an.',
  },
  en: {
    titel: 'Join the Phalanx Expert Network',
    intro: 'We are building our own network of interim managers, consultants and specialists. When a suitable mandate comes up, we go straight to the network instead of through large platforms. One profile, maintained by you, and we get in touch when it really fits.',
    karten: [
      { icon: Target, titel: 'Matching mandates', text: 'Our matching engine compares skills, availability and daily rate. If a project fits 60 percent or better, you get an email. Otherwise you hear nothing from us.' },
      { icon: CalendarClock, titel: 'Availability in one click', text: 'Every 14 days we ask briefly. One click in the email is enough, no login needed. That way clients know the information is current.' },
      { icon: Euro, titel: 'Your terms', text: 'Daily rates, travel readiness, working model: you maintain all of it yourself. We do not negotiate behind your back.' },
      { icon: ShieldCheck, titel: 'Your data stays yours', text: 'No selling, no passing on without your approval. Profiles go to partners anonymised and only with your opt-in. Consent revocable at any time.' },
    ],
    ablaufTitel: 'Five minutes to join',
    schritte: [
      'Register and confirm your email',
      'Add summary, skills and daily rate, upload your CV',
      'Set availability and receive matching projects',
    ],
    cta: 'Create your profile',
    login: 'I already have an account',
    partner: 'You have a network of your own and want to earn from it? Take a look at the associated partnership.',
  },
};

export default function Mitmachen() {
  const { lang, setLang } = useLang();
  const t = T[lang] || T.de;
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo />
        <span style={{ fontSize: 12 }}>
          {['de', 'en'].map((L) => (
            <button key={L} type="button" onClick={() => setLang(L)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: lang === L ? 700 : 400, color: lang === L ? 'var(--navy)' : 'var(--grey-400, #8a93a0)' }}>{L.toUpperCase()}</button>
          ))}
        </span>
      </div>

      <h1 style={{ color: 'var(--navy)', margin: '22px 0 10px' }}>{t.titel}</h1>
      <p style={{ fontSize: 16, lineHeight: 1.6 }}>{t.intro}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, margin: '24px 0' }}>
        {t.karten.map(({ icon: Icon, titel, text }) => (
          <div className="card" key={titel}>
            <h3><Icon size={17} /> {titel}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.55 }}>{text}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>{t.ablaufTitel}</h3>
        <ol style={{ margin: '10px 0 16px 18px', fontSize: 14, lineHeight: 1.8 }}>
          {t.schritte.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <Link to="/register" className="btn" style={{ display: 'inline-block', width: 'auto', textDecoration: 'none', padding: '12px 24px' }}>
          {t.cta}
        </Link>
        <p style={{ marginTop: 12, fontSize: 13 }}>
          <Link to="/login">{t.login}</Link>
        </p>
      </div>

      <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
        {t.partner} <Link to="/partner">{tr(lang, 'Assoziierte Partner', 'Associated partners')}</Link>
      </p>
      <LegalFooter />
    </div>
  );
}
