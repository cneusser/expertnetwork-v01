import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const home = user?.role === 'admin' ? '/admin' : '/dashboard';
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to={home} style={{ textDecoration: 'none' }}><Logo inverse /></Link>
          <nav className="topnav">
            <NavLink to={home} end>Dashboard</NavLink>
            {user?.role === 'admin' && <NavLink to="/admin/experten">Experten</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin/audit">Audit-Log</NavLink>}
            {user?.role === 'expert' && <NavLink to="/profil">Mein Profil</NavLink>}
          </nav>
        </div>
        <div className="user">
          <span>{user?.email} · {user?.role === 'admin' ? 'Administrator' : 'Experte'}</span>
          <button onClick={logout}>Abmelden</button>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
