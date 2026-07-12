import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Logo inverse />
        <div className="user">
          <span>{user?.email} · {user?.role === 'admin' ? 'Administrator' : 'Experte'}</span>
          <button onClick={logout}>Abmelden</button>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
