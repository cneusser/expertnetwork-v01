import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
    } finally {
      setSent(true);
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo variante="dunkel" form="stapel" zusatz="Expert Network" />
        <h1>Zugang anfordern</h1>
        {sent ? (
          <div className="msg msg-success">
            Falls die Adresse bei uns hinterlegt ist, haben wir dir gerade eine
            E-Mail geschickt. Wenn du schon ein Passwort hattest, steht darin ein
            Link zum Zurücksetzen, eine Stunde gültig. Wenn du von uns eingeladen
            wurdest und noch nie ein Passwort vergeben hast, ist es deine
            Einladung, über die du beides auf einmal erledigst.
            <br /><br />
            Schau bitte auch kurz in den Spam-Ordner.
          </div>
        ) : (
          <>
            {/* v1.35.0: Dieselbe Seite deckt beide Faelle ab. Welcher es ist,
                entscheidet der Server, denn eine Einladung braucht die
                Einwilligung und ein Passwort-Reset wuerde sie ueberspringen. */}
            <p className="sub">
              Egal ob du dein Passwort vergessen hast oder von uns eingeladen wurdest und noch
              gar keins vergeben konntest: Trag deine Adresse ein, wir schicken dir den
              passenden Link.
            </p>
            <div className="field">
              <label htmlFor="email">E-Mail-Adresse</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <button className="btn" disabled={busy}>{busy ? 'Senden…' : 'Link anfordern'}</button>
          </>
        )}
        <div className="auth-links"><Link to="/login">Zur Anmeldung</Link></div>
      </form>
    </div>
  );
}
