import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import { useLang, tr } from '../i18n';
import { APP_VERSION } from '../version';
import { api } from '../api/client';

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
          <Link to={home} style={{ textDecoration: 'none' }}><Logo inverse /></Link>
          <nav className="topnav">
            <NavLink to={home} end>Dashboard</NavLink>
            {isAdmin && <NavLink to="/admin/experten">Experten</NavLink>}
            {isAdmin && <NavLink to="/admin/suche">Suche</NavLink>}
            {isAdmin && <NavLink to="/admin/skills">Skills</NavLink>}
            {isAdmin && <NavLink to="/admin/projekte">Projekte</NavLink>}
            {isAdmin && <NavLink to="/admin/funnel">Funnel</NavLink>}
            {isAdmin && <NavLink to="/admin/partner">Partner</NavLink>}
            {isAdmin && <NavLink to="/admin/abrechnung">Abrechnung</NavLink>}
            {isAdmin && <NavLink to="/admin/kommunikation">Kommunikation</NavLink>}
            {isAdmin && <NavLink to="/admin/mails">Mails</NavLink>}
            {isAdmin && <NavLink to="/admin/audit">Audit-Log</NavLink>}
            {isAdmin && <NavLink to="/admin/mandanten">Mandanten</NavLink>}
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
