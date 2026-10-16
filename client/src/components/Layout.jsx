import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import { useLang, tr } from '../i18n';
import { APP_VERSION } from '../version';
import { api } from '../api/client';
import { TerminKnopf } from './MarkenUmschalter';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { lang, setLang } = useLang();
  const isAdmin = ['admin', 'tenant_owner'].includes(user?.role);
  const home = user?.role === 'vendor' ? '/vendor' : isAdmin ? '/admin' : '/dashboard';
  return (
    <div className="app-shell">
      {user?.impersonated && (
        <div className="birdview-banner">
          Birdview aktiv — Sie sehen die Plattform aus der Sicht von <strong>{user.email}</strong>.
          <button onClick={async () => { await api.post('/api/auth/stop-impersonate'); window.location.href = '/admin'; }}>
            Zurück zur Admin-Ansicht
          </button>
        </div>
      )}
      <header className="topbar">
        <div className="topbar-left">
          <Link to={home} style={{ textDecoration: 'none' }}>
            <Logo variante="dunkel" zusatz="Expert Network" size={30} />
          </Link>
          <nav className="topnav">
            <NavLink to={home} end>Dashboard</NavLink>
            {isAdmin && ADMIN_BEREICHE.map((b) => <Bereich key={b.titel} bereich={b} />)}
            {user?.role === 'expert' && <NavLink to="/profil">{tr(lang, 'Mein Profil', 'My profile')}</NavLink>}
            {user?.role === 'expert' && <NavLink to="/projekte">{tr(lang, 'Projekte', 'Projects')}</NavLink>}
            <NavLink to="/konto">{tr(lang, 'Konto', 'Account')}</NavLink>
          </nav>
        </div>
        <div className="user">
          {user?.role === 'expert' && (
            <span style={{ marginRight: 10 }}>
              {['de', 'en'].map((L) => (
                <button key={L} onClick={() => setLang(L)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', color: '#fff', opacity: lang === L ? 1 : 0.55, fontWeight: lang === L ? 700 : 400 }}>
                  {L.toUpperCase()}
                </button>
              ))}
            </span>
          )}
          <TerminKnopf klasse="pxl-termin-topbar" text={tr(lang, 'Termin', 'Book a call')} />
          <span>{user?.email} · {user?.role === 'vendor' ? 'Kunde' : isAdmin ? 'Administrator' : tr(lang, 'Experte', 'Expert')}</span>
          <button onClick={logout}>{user?.role === 'expert' ? tr(lang, 'Abmelden', 'Log out') : 'Abmelden'}</button>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer style={{ padding: '14px 28px', fontSize: 12, color: 'var(--grey-400)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>
          <a href="https://www.phalanx.de/de/impressum" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Impressum</a>
          {' · '}
          <Link to="/datenschutz" style={{ color: 'inherit' }}>Datenschutz</Link>
        </span>
        <span>Phalanx Expert Network · {APP_VERSION}</span>
      </footer>
    </div>
  );
}

/**
 * v1.46.0 — Die Navigation nach dem Ablauf gegliedert.
 *
 * Achtzehn Punkte nebeneinander sind keine Navigation, sondern eine
 * Aufzählung. Man findet darin nur, was man schon kennt, und übersieht den
 * Rest.
 *
 * Gegliedert wird nach der Reihenfolge, in der das Geschäft entsteht, nicht
 * nach technischer Verwandtschaft: Erst kommen Leute ins Netzwerk, dann
 * entsteht Nachfrage, dann wird abgerechnet. Was man täglich braucht, steht
 * oben in der Leiste; was man selten braucht, liegt unter "Verwaltung".
 *
 * Die drei meistgenutzten Wege bleiben als eigene Punkte stehen, ohne
 * Aufklappen: Ein Klick weniger bei etwas, das man zehnmal am Tag tut, ist
 * mehr wert als eine saubere Systematik.
 */
const ADMIN_BEREICHE = [
  {
    titel: 'Netzwerk',
    punkte: [
      ['/admin/experten', 'Experten', 'Alle Profile im Pool'],
      ['/admin/ansprache', 'Ansprache', 'Wen habe ich angeschrieben'],
      ['/admin/suche', 'Suche', 'Im Pool suchen'],
      ['/admin/skills', 'Skills', 'Begriffe pflegen und freigeben'],
    ],
  },
  {
    titel: 'Geschäft',
    punkte: [
      ['/admin/anfragen', 'Anfragen', 'Projektanfragen einlesen'],
      ['/admin/projekte', 'Projekte', 'Pipeline und Vorlagen'],
      ['/admin/funnel', 'Funnel', 'Alle Kandidaten je Stufe'],
      ['/admin/kunden', 'Kunden', 'Verzeichnis und Freigabe'],
    ],
  },
  {
    titel: 'Partner',
    punkte: [
      ['/admin/partner', 'Assoziierte Partner', 'Wer bringt Mandate mit'],
      ['/admin/kapitalpartner', 'Kapitalpartner', 'Verzeichnis der Finanzierer'],
    ],
  },
  { titel: 'Abrechnung', pfad: '/admin/abrechnung' },
  { titel: 'Bericht', pfad: '/admin/bericht' },
  {
    titel: 'Verwaltung',
    punkte: [
      ['/admin/kommunikation', 'Kommunikation', 'Posteingang und Rundmail'],
      ['/admin/mails', 'Mailvorlagen', 'Texte ändern'],
      ['/admin/adressen', 'Adressen', 'Vorschläge und Zerlegung'],
      ['/admin/phalanx-os', 'Phalanx OS', 'Anbindung und Abgleich'],
      ['/admin/audit', 'Protokoll', 'Wer hat was geändert'],
      ['/admin/mandanten', 'Mandanten', 'Konten und Rollen'],
    ],
  },
];

/**
 * Ein Bereich in der Leiste: entweder ein Link oder ein Aufklappmenü.
 *
 * Aufgeklappt wird per Klick und nicht beim Überfahren. Ein Menü, das sich
 * öffnet, weil die Maus vorbeikommt, klappt auch auf, wenn man woanders hin
 * will, und auf einem Tablet gibt es kein Überfahren.
 */
function Bereich({ bereich }) {
  const [offen, setOffen] = useState(false);
  const ref = useRef(null);
  const ort = useLocation();

  // Beim Seitenwechsel zu. Sonst steht das Menü noch offen, wenn die neue
  // Seite schon da ist.
  useEffect(() => { setOffen(false); }, [ort.pathname]);

  useEffect(() => {
    if (!offen) return undefined;
    const weg = (e) => { if (ref.current && !ref.current.contains(e.target)) setOffen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('mousedown', weg);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', weg);
      document.removeEventListener('keydown', esc);
    };
  }, [offen]);

  if (bereich.pfad) return <NavLink to={bereich.pfad}>{bereich.titel}</NavLink>;

  // Steht man auf einer Seite dieses Bereichs, ist der Bereich markiert.
  const drin = bereich.punkte.some(([pfad]) => ort.pathname.startsWith(pfad));

  return (
    <div className={`nav-bereich${offen ? ' offen' : ''}`} ref={ref}>
      <button type="button" className={drin ? 'aktiv' : ''}
        aria-expanded={offen} onClick={() => setOffen((o) => !o)}>
        {bereich.titel} <ChevronDown size={13} />
      </button>
      {offen && (
        <div className="nav-klappe">
          {bereich.punkte.map(([pfad, name, erklaerung]) => (
            <NavLink key={pfad} to={pfad}>
              <span className="nav-name">{name}</span>
              {erklaerung && <span className="nav-erklaerung">{erklaerung}</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
