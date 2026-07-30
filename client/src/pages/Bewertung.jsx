/** v1.15.0 — Öffentliche Kundenbewertung per Token-Link: Sterne + Freitext, einmalig. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';
import { api } from '../api/client';
import { useLang, tr } from '../i18n';

export default function Bewertung() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { lang } = useLang();
  const [info, setInfo] = useState(null);
  const [fehler, setFehler] = useState('');
  const [sterne, setSterne] = useState(0);
  const [hover, setHover] = useState(0);
  const [kommentar, setKommentar] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setFehler('Link unvollständig.'); return; }
    api.get(`/api/public/bewertung/${token}`).then(setInfo).catch((e) => setFehler(e.message));
  }, [token]);

  const senden = async () => {
    setBusy(true);
    try {
      const d = await api.post(`/api/public/bewertung/${token}`, { sterne, kommentar });
      setDone(d.message);
    } catch (e) { setFehler(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <h1>{tr(lang, 'Ihre Bewertung', 'Your feedback')}</h1>
        {fehler && <div className="msg msg-error">{fehler}</div>}
        {done && <div className="msg msg-success">{done}</div>}
        {info && !done && !fehler && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.55 }}>
              {tr(lang, 'Wie zufrieden waren Sie mit', 'How satisfied were you with')}{' '}
              <strong>{info.experte}</strong>
              {info.projekt ? ` (${info.projekt})` : ''}?
            </p>
            <div style={{ fontSize: 34, margin: '10px 0 4px', cursor: 'pointer', userSelect: 'none' }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} onClick={() => setSterne(s)}
                  onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
                  style={{ color: s <= (hover || sterne) ? '#d4a017' : 'var(--grey-200, #e3e6ea)' }}>★</span>
              ))}
            </div>
            <div className="field">
              <label>{tr(lang, 'Möchten Sie etwas ergänzen? (optional)', 'Anything to add? (optional)')}</label>
              <textarea rows={4} value={kommentar} onChange={(e) => setKommentar(e.target.value)}
                style={{ width: '100%', fontFamily: 'inherit', fontSize: 14 }} />
            </div>
            <button className="btn" disabled={!sterne || busy} onClick={senden}>
              {busy ? tr(lang, 'Wird gesendet…', 'Sending…') : tr(lang, 'Bewertung absenden', 'Submit feedback')}
            </button>
          </>
        )}
        <LegalFooter />
      </div>
    </div>
  );
}
