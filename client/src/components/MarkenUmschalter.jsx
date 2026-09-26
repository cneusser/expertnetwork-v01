/**
 * v1.34.0 — Umschalter über die Phalanx-Auftritte, unten links.
 *
 * Vorbild ist der Umschalter auf der Sandbox-Seite. Der Nutzen ist nicht
 * Navigation im engeren Sinn, sondern Orientierung: Man sieht auf jeder Seite,
 * dass hier vier Auftritte zu einem Haus gehören, und kommt mit einem Klick
 * hinüber. Der aktuelle Auftritt steht mit, ist aber kein Link, sondern
 * hervorgehoben. Ohne ihn wüsste man nicht, wo man gerade ist.
 *
 * Neue Auftritte kommen in die Liste, sonst ändert sich nichts.
 */
const AUFTRITTE = [
  { kurz: 'phalanx.de', url: 'https://phalanx.de' },
  { kurz: 'christian-neusser.de', url: 'https://christian-neusser.de' },
  { kurz: 'CapitalMatch', url: 'https://www.capitalmatch.de' },
  { kurz: 'Expert Network', url: 'https://experts.phalanx.de', hier: true },
];

export default function MarkenUmschalter() {
  return (
    <nav className="pxl-switch" aria-label="Phalanx-Auftritte">
      {AUFTRITTE.map((a) => (a.hier ? (
        <span key={a.kurz} className="pxl-switch-hier" aria-current="page">{a.kurz}</span>
      ) : (
        <a key={a.kurz} href={a.url} target="_blank" rel="noreferrer">{a.kurz}</a>
      )))}
    </nav>
  );
}

/** Termin vereinbaren. Steht auf jeder Außenseite und im Kopf der Anwendung. */
export const TERMIN_URL = 'https://calendly.com/neusser/kaffee-chat';

export function TerminKnopf({ klasse = 'pxl-termin-kopf', text = 'Termin vereinbaren' }) {
  return (
    <a className={klasse} href={TERMIN_URL} target="_blank" rel="noreferrer">
      {text}
      <span aria-hidden="true">→</span>
    </a>
  );
}
