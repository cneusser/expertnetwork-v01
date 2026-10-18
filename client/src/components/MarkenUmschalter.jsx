import { useEffect, useState } from 'react';
import { api } from '../api/client';

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

/**
 * Termin vereinbaren. Steht auf jeder Außenseite und im Kopf der Anwendung.
 *
 * v1.50.0: Die Adresse kommt vom Server, nicht aus dem gebauten Bündel. Sie
 * zeigte auf Calendly, zeigt jetzt auf die Termin-App in Phalanx OS, und der
 * Link enthält einen Token, der irgendwann ein anderer ist. Ein Wert, den
 * man nur durch einen neuen Build ändern kann, ändert irgendwann niemand mehr.
 *
 * Bis die Antwort da ist, steht kein Knopf da. Lieber kurz nichts als ein
 * Knopf, der ins Leere führt, weil jemand schneller geklickt hat als das Netz.
 */
export const TERMIN_FALLBACK = 'https://phalanx-os-production.up.railway.app/api/termine/'
  + 'a9a267e1c8385afadc70e5fd2545c958bcf6cb0e73dd51e8?typ=8&fest=1';

// Einmal je Seitenaufruf geholt und gemerkt. Der Knopf steht an mehreren
// Stellen, und jede davon ein eigener Abruf wäre Unfug.
let gemerkt = null;
let laeuft = null;

export function useTerminUrl() {
  const [url, setUrl] = useState(gemerkt);

  useEffect(() => {
    if (gemerkt) { setUrl(gemerkt); return; }
    laeuft = laeuft || api.get('/api/konfig').then((d) => {
      gemerkt = d.termin_url || TERMIN_FALLBACK;
      return gemerkt;
    }).catch(() => {
      // Erreicht der Abruf den Server nicht, nehmen wir den bekannten Wert.
      // Ein fehlender Terminknopf wäre schlimmer als ein leicht veralteter.
      gemerkt = TERMIN_FALLBACK;
      return gemerkt;
    });
    laeuft.then(setUrl);
  }, []);

  return url;
}

export function TerminKnopf({ klasse = 'pxl-termin-kopf', text = 'Termin vereinbaren' }) {
  const url = useTerminUrl();
  if (!url) return null;
  return (
    <a className={klasse} href={url} target="_blank" rel="noreferrer">
      {text}
      <span aria-hidden="true">→</span>
    </a>
  );
}
