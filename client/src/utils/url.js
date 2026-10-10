/**
 * v1.41.1 — Eine Adresse so aufbereiten, dass ein Klick darauf funktioniert.
 *
 * Gespeichert werden Profil- und Webadressen oft ohne Schema, etwa als
 * "linkedin.com/in/jemand". Steht so ein Wert in einem href, hält der Browser
 * ihn für einen relativen Pfad und hängt ihn an die aktuelle Seite an. Aus
 * dem Klick auf ein LinkedIn-Profil wird dann
 * experts.phalanx.de/admin/experten/linkedin.com/in/jemand, also wieder die
 * eigene Anwendung.
 *
 * Es gab dafür schon drei Schreibweisen an verschiedenen Stellen und eine
 * vierte Stelle ganz ohne. Deshalb jetzt eine Funktion.
 */
export function externeUrl(wert) {
  const w = String(wert ?? '').trim();
  if (!w) return null;

  // Nur http und https. Ein gespeichertes "javascript:..." darf nie in ein
  // href geraten, auch wenn es hier niemand absichtlich einträgt.
  if (/^https?:\/\//i.test(w)) return w;
  if (/^[a-z][a-z0-9+.-]*:/i.test(w)) return null;

  return `https://${w.replace(/^\/+/, '')}`;
}

/** Dieselbe Adresse verkürzt, damit die Zeile nicht ausfranst. */
export function kurzeUrl(wert, max = 48) {
  const w = String(wert ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return w.length > max ? `${w.slice(0, max - 1)}…` : w;
}

export default externeUrl;
