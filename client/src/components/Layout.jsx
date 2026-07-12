import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import { APP_VERSION } from '../version';
import { api } from '../api/client';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const home = user?.role === 'admin' ? '/admin' : '/dashboard';
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
            {user?.role === 'admin' && <NavLink to="/admin/experten">Experten</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin/suche">Suche</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin/projekte">Projekte</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin/kommunikation">Kommunikation</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin/audit">Audit-Log</NavLink>}
            {user?.role === 'expert' && <NavLink to="/profil">Mein Profil</NavLink>}
            {user?.role === 'expert' && <NavLink to="/projekte">Projekte</NavLink>}
            <NavLink to="/konto">Konto</NavLink>
          </nav>
        </div>
        <div className="user">
          <span>{user?.email} · {user?.role === 'admin' ? 'Administrator' : 'Experte'}</span>
          <button onClick={logout}>Abmelden</button>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer style={{ padding: '14px 28px', fontSize: 12, color: 'var(--grey-400)', textAlign: 'right' }}>
        Phalanx Expert Network · {APP_VERSION}
      </footer>
    </div>
  );
}
