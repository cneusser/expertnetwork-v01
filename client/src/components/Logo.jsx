/**
 * v1.34.0 — Das Phalanx-Logo als SVG.
 *
 * Bis hierher stand hier nur Text in CSS. Das war eine bewusste Entscheidung
 * gegen eine Bilddatei, hatte aber den Preis, dass die Marke nirgends auftauchte.
 * Ein SVG löst beides: Es ist scharf in jeder Größe, wiegt nichts, lässt sich
 * über currentColor einfärben und braucht keinen zusätzlichen Netzaufruf.
 *
 * Das Signet: sechs Blütenblätter auf einer geschliffenen Scheibe, deren
 * Segmente unterschiedlich hell sind. Die Wortmarke bleibt echter Text in
 * Kapitälchen, damit sie sich mitskaliert, vorgelesen werden kann und in der
 * Suche auffindbar bleibt.
 *
 * Varianten:
 *   hell   dunkle Blüte auf heller Fläche (Verwaltung, Portal)
 *   dunkel helle Blüte auf dunkler Bühne  (Anmeldung, Landingpages)
 */

const SEGMENTE = [
  '#c3d4e6', '#dbe6f1', '#a9c1da', '#cfdcea', '#b6cade', '#e3ebf4',
  '#b0c5db', '#d5e0ed', '#bdcfe2', '#e8eef6', '#aabfd7', '#c9d8e8',
];

/** Ein Blütenblatt, gezeichnet aus der Mitte nach außen. */
const BLATT = 'M0,-14 C5.4,-30 9.4,-42 0,-52 C-9.4,-42 -5.4,-30 0,-14 Z';

export function Signet({ size = 40, variante = 'hell', schatten = false }) {
  const dunkel = variante === 'dunkel';
  const bluete = dunkel ? '#f7f5f0' : '#1f3346';
  const kern = dunkel ? '#142536' : '#ffffff';

  return (
    <svg width={size} height={size} viewBox="-64 -64 128 128" role="img" aria-label="Phalanx"
      style={schatten ? { filter: 'drop-shadow(0 2px 6px rgba(17,24,32,.18))' } : undefined}>
      {/* Die geschliffene Scheibe: zwölf Segmente in wechselnder Helligkeit. */}
      <g>
        {SEGMENTE.map((farbe, i) => {
          const a1 = (i * 30 - 90) * (Math.PI / 180);
          const a2 = ((i + 1) * 30 - 90) * (Math.PI / 180);
          const r = 62;
          const x1 = Math.cos(a1) * r;
          const y1 = Math.sin(a1) * r;
          const x2 = Math.cos(a2) * r;
          const y2 = Math.sin(a2) * r;
          return (
            <path key={farbe + i} d={`M0,0 L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`}
              fill={dunkel ? farbe : farbe} opacity={dunkel ? 0.55 : 1} />
          );
        })}
      </g>
      {/* Sechs Blätter, um 30 Grad gedreht, damit keines exakt nach oben zeigt. */}
      <g fill={bluete}>
        {[0, 60, 120, 180, 240, 300].map((grad) => (
          <path key={grad} d={BLATT} transform={`rotate(${grad + 30})`} />
        ))}
      </g>
      <circle cx="0" cy="0" r="11" fill={kern} />
    </svg>
  );
}

export default function Logo({
  variante = 'hell', size = 34, zusatz = null, stapel = false, ohneWort = false,
}) {
  const dunkel = variante === 'dunkel';
  if (ohneWort) return <Signet size={size} variante={variante} />;

  return (
    <span className={`pxl-logo${stapel ? ' pxl-logo-stapel' : ''}${dunkel ? ' pxl-logo-dunkel' : ''}`}>
      <Signet size={size} variante={variante} />
      <span className="pxl-logo-text">
        <span className="pxl-wortmarke">Phalanx</span>
        {zusatz && <span className="pxl-logo-zusatz">{zusatz}</span>}
      </span>
    </span>
  );
}
