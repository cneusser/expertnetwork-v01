/** v1.6.0 — Impressum-/Datenschutz-Zeile für alle Seiten (auch öffentliche). */
import { Link } from 'react-router-dom';

export default function LegalFooter({ style }) {
  return (
    <p style={{ fontSize: 12, color: 'var(--grey-400, #8a93a0)', textAlign: 'center', margin: '18px 0 8px', ...style }}>
      Phalanx GmbH ·{' '}
      <a href="https://www.phalanx.de/de/impressum" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Impressum</a>
      {' · '}
      <Link to="/datenschutz" style={{ color: 'inherit' }}>Datenschutz</Link>
    </p>
  );
}
