/**
 * v1.34.1 — Das Original-Logo, unverändert.
 *
 * Der Nachbau aus v1.34.0 ist raus. Ein Logo zeichnet man nicht nach, man
 * verwendet es. Die Dateien liegen in client/public und stammen aus der
 * Illustrator-Vorlage:
 *
 *   phalanx-logo.png       gestapelt, Originalfarben auf weißem Grund
 *   phalanx-logo-frei.png  dasselbe freigestellt, nur das äußere Weiß ist
 *                          transparent, der weiße Kreis in der Blütenmitte bleibt
 *   phalanx-signet.png     nur die Blüte, für schmale Leisten
 *
 * Auf dunklem Grund sitzt das Logo in einem hellen Feld, statt seine Farben zu
 * verändern. Die Wortmarke ist anthrazit und wäre auf Navy nicht lesbar, und
 * ein umgefärbtes Logo ist kein Logo mehr. phalanx.de macht es genauso: dunkle
 * Seite, heller Kopfbereich.
 */

/** Nur die Blüte. Für Stellen, an denen die Wortmarke nicht hinpasst. */
export function Signet({ size = 34, className = '' }) {
  return (
    <img src="/phalanx-signet.png" alt="Phalanx" width={size} height={size}
      className={className} style={{ display: 'block' }} />
  );
}

/**
 * variante 'hell'   auf hellem Grund, Logo pur
 *          'dunkel' auf dunklem Grund, Logo in hellem Feld
 * form     'quer'   Blüte links, Wortmarke rechts daneben (Leisten)
 *          'stapel' Blüte über der Wortmarke, wie im Original
 */
export default function Logo({
  variante = 'hell', form = 'quer', size = 34, zusatz = null, ohneWort = false,
}) {
  const dunkel = variante === 'dunkel';

  if (form === 'stapel') {
    return (
      <span className={`pxl-logo pxl-logo-stapel${dunkel ? ' pxl-logo-feld' : ''}`}>
        <img src={dunkel ? '/phalanx-logo-frei.png' : '/phalanx-logo.png'}
          alt="Phalanx" width={size * 2.6} style={{ height: 'auto', display: 'block' }} />
        {zusatz && <span className="pxl-logo-zusatz">{zusatz}</span>}
      </span>
    );
  }

  return (
    <span className={`pxl-logo${dunkel ? ' pxl-logo-feld' : ''}`}>
      <Signet size={size} />
      {!ohneWort && (
        <span className="pxl-logo-text">
          <span className="pxl-wortmarke">Phalanx</span>
          {zusatz && <span className="pxl-logo-zusatz">{zusatz}</span>}
        </span>
      )}
    </span>
  );
}
