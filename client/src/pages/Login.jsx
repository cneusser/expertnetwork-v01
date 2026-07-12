import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'vendor' ? '/vendor' : ['admin', 'tenant_owner'].includes(user.role) ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h1>Anmelden</h1>
        <p className="sub">Privates Expertennetzwerk der Phalanx GmbH</p>
        {error && <div className="msg msg-error">{error}</div>}
        <div className="field">
          <label htmlFor="email">E-Mail-Adresse</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">Passwort</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Anmelden…' : 'Anmelden'}</button>
        <div className="auth-links">
          <Link to="/register">Als Experte registrieren</Link>
          <Link to="/forgot-password">Passwort vergessen?</Link>
        </div>
      </form>
    </div>
  );
}
