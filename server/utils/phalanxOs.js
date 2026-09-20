/**
 * v1.32.0 — Anbindung an Phalanx OS: OpenID Connect und Datenpool.
 *
 * Bewusst ohne `openid-client`. Version 6 ist reines ESM, dieser Server ist
 * durchgehend CommonJS, das würde einen Umbau erzwingen. Version 5 wäre
 * CommonJS, aber überholt. Node kann JWKS-Schlüssel über `crypto.createPublicKey`
 * mit `format: 'jwk'` direkt lesen, `jsonwebtoken` prüft damit RS256. Damit
 * bekommen wir PKCE und die vollständige Token-Prüfung ohne eine einzige neue
 * Abhängigkeit.
 *
 * Der vorhandene LinkedIn-Flow in `linkedinOidc.js` ist ausdrücklich kein
 * Vorbild: Der holt nur `userinfo` und prüft gar kein ID-Token, ohne PKCE und
 * ohne `nonce`. Für ein Verfahren, das Admin-Rechte vergibt, ist das zu wenig.
 * Hier wird deshalb alles geprüft, was zu prüfen ist: Signatur, Aussteller,
 * Empfänger, Ablauf und die Einmalkennung gegen Wiedereinspielung.
 *
 * Der `client_secret` steht ausschließlich in der Umgebung, wird nie
 * protokolliert und taucht in keiner Fehlermeldung auf.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BASIS = () => (process.env.PHALANX_OS_BASE_URL || '').replace(/\/+$/, '');
const APP_URL = () => process.env.APP_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3001');

const eingerichtet = () => Boolean(
  BASIS() && process.env.PHALANX_OS_CLIENT_ID && process.env.PHALANX_OS_CLIENT_SECRET,
);
const redirectUri = () => process.env.PHALANX_OS_REDIRECT_URI || `${APP_URL()}/api/auth/phalanx/callback`;

/* ------------------------- Discovery und Schlüssel ------------------------- */

let discoveryCache = null;
let jwksCache = null;

/** Die Endpunkte kommen von der Gegenstelle, nicht aus unseren Annahmen. */
async function discovery({ frisch = false } = {}) {
  if (discoveryCache && !frisch && discoveryCache.geholt > Date.now() - 3600000) return discoveryCache.daten;
  if (!BASIS()) throw new Error('PHALANX_OS_BASE_URL fehlt');

  const res = await fetch(`${BASIS()}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Discovery fehlgeschlagen (${res.status})`);
  const daten = await res.json();
  for (const pflicht of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (!daten[pflicht]) throw new Error(`Discovery unvollständig, ${pflicht} fehlt`);
  }
  discoveryCache = { daten, geholt: Date.now() };
  return daten;
}

/** Öffentliche Schlüssel holen und als KeyObject je kid ablegen. */
async function schluessel(kid, { frisch = false } = {}) {
  if (!jwksCache || frisch || jwksCache.geholt < Date.now() - 3600000) {
    const { jwks_uri: uri } = await discovery({ frisch });
    const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`JWKS-Abruf fehlgeschlagen (${res.status})`);
    const { keys } = await res.json();
    const map = new Map();
    for (const k of keys || []) {
      try { map.set(k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })); } catch { /* unbrauchbarer Schlüssel */ }
    }
    jwksCache = { map, geholt: Date.now() };
  }
  const treffer = jwksCache.map.get(kid);
  // Unbekannte kid heißt meist: die Gegenstelle hat rotiert. Einmal neu holen.
  if (!treffer && !frisch) return schluessel(kid, { frisch: true });
  return treffer;
}

/* ------------------------------ Anmeldung ------------------------------ */

const zufall = (n = 32) => crypto.randomBytes(n).toString('base64url');
const challenge = (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url');

/**
 * Startpunkt: Adresse, Verifier und Einmalkennung erzeugen. Verifier und
 * Kennung gehören in ein kurzlebiges, signiertes Cookie, nicht in die URL.
 */
async function anmeldeStart() {
  const d = await discovery();
  const verifier = zufall(48);
  const state = zufall(24);
  const nonce = zufall(24);
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.PHALANX_OS_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: 'openid profile email roles',
    state,
    nonce,
    code_challenge: challenge(verifier),
    code_challenge_method: 'S256',
  });
  return { url: `${d.authorization_endpoint}?${q}`, verifier, state, nonce };
}

/**
 * Rückkehr: Code gegen Token tauschen und das ID-Token vollständig prüfen.
 * Liefert die Angaben aus dem Token, nie das Token selbst.
 */
async function anmeldeAbschluss(code, verifier, nonce) {
  const d = await discovery();
  const res = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: process.env.PHALANX_OS_CLIENT_ID,
      client_secret: process.env.PHALANX_OS_CLIENT_SECRET,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Token-Tausch fehlgeschlagen (${res.status})`);
  const { id_token: idToken } = await res.json();
  if (!idToken) throw new Error('Antwort ohne ID-Token');

  const kopf = jwt.decode(idToken, { complete: true })?.header;
  if (!kopf?.kid) throw new Error('ID-Token ohne Schlüsselkennung');
  if (kopf.alg !== 'RS256') throw new Error(`Unerwartetes Signaturverfahren: ${kopf.alg}`);
  const key = await schluessel(kopf.kid);
  if (!key) throw new Error('Kein passender öffentlicher Schlüssel');

  const angaben = jwt.verify(idToken, key, {
    algorithms: ['RS256'],
    issuer: d.issuer,
    audience: process.env.PHALANX_OS_CLIENT_ID,
    clockTolerance: 30,
  });
  // Ohne diese Prüfung wäre ein abgefangenes Token wiederverwendbar.
  if (!nonce || angaben.nonce !== nonce) throw new Error('Einmalkennung stimmt nicht');
  if (!angaben.sub) throw new Error('Token ohne Nutzerkennung');

  return {
    sub: String(angaben.sub),
    email: angaben.email ? String(angaben.email).trim().toLowerCase() : null,
    email_verified: angaben.email_verified === true,
    name: angaben.name || null,
    roles: Array.isArray(angaben.roles) ? angaben.roles : [],
    tenant: angaben.tenant || null,
  };
}

/* ------------------------------ Datenpool ------------------------------ */

let tokenCache = null;

/** Maschinentoken, eine Stunde gültig. Eine Minute Sicherheitsabstand. */
async function poolToken({ frisch = false } = {}) {
  if (tokenCache && !frisch && tokenCache.gueltig_bis > Date.now() + 60000) return tokenCache.token;
  if (!eingerichtet()) throw new Error('Phalanx OS ist nicht eingerichtet (Umgebungsvariablen fehlen)');

  const d = await discovery();
  const res = await fetch(d.token_endpoint || `${BASIS()}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.PHALANX_OS_CLIENT_ID,
      client_secret: process.env.PHALANX_OS_CLIENT_SECRET,
      scope: 'pool.read pool.write',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Pool-Token fehlgeschlagen (${res.status})`);
  const d2 = await res.json();
  if (!d2.access_token) throw new Error('Antwort ohne access_token');
  tokenCache = {
    token: d2.access_token,
    gueltig_bis: Date.now() + (Number(d2.expires_in) || 3600) * 1000,
  };
  return tokenCache.token;
}

/**
 * Aufruf gegen den Pool. Bei 401 einmal mit frischem Token wiederholen, weil
 * ein Token auch vor Ablauf zurückgezogen werden kann.
 */
async function poolAufruf(pfad, { method = 'GET', body = null, wiederholt = false } = {}) {
  const token = await poolToken({ frisch: wiederholt });
  const res = await fetch(`${BASIS()}${pfad}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401 && !wiederholt) {
    tokenCache = null;
    return poolAufruf(pfad, { method, body, wiederholt: true });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pool-Aufruf ${pfad} fehlgeschlagen (${res.status}) ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Kontakte seitenweise holen. Der Pool begrenzt auf 500 je Seite, wir bleiben
 * bei 200, damit ein einzelner Abruf nicht in den Zeitablauf läuft.
 */
async function kontakte({ tag = null, updatedSince = null, limit = 200, maxSeiten = 50 } = {}) {
  const alle = [];
  for (let seite = 0; seite < maxSeiten; seite += 1) {
    const q = new URLSearchParams({ limit: String(limit), offset: String(seite * limit) });
    if (tag) q.set('tag', tag);
    if (updatedSince) q.set('updated_since', new Date(updatedSince).toISOString());
    const antwort = await poolAufruf(`/api/pool/v1/contacts?${q}`);
    const teil = Array.isArray(antwort) ? antwort : (antwort.contacts || antwort.data || antwort.items || []);
    alle.push(...teil);
    if (teil.length < limit) break;
  }
  return alle;
}

/** Idempotenter Upsert. Wiederholte Aufrufe mit derselben source_id aktualisieren. */
async function meldeKontakt(datensatz) {
  return poolAufruf('/api/pool/v1/contacts', { method: 'PUT', body: datensatz });
}

/** Lebenszeichen für die Verwaltungsseite: Token holen und einen Datensatz lesen. */
async function ping() {
  if (!eingerichtet()) {
    return { ok: false, grund: 'nicht eingerichtet', fehlend: fehlendeVariablen() };
  }
  try {
    const d = await discovery({ frisch: true });
    await poolToken({ frisch: true });
    const probe = await poolAufruf('/api/pool/v1/contacts?limit=1');
    const teil = Array.isArray(probe) ? probe : (probe.contacts || probe.data || probe.items || []);
    return { ok: true, issuer: d.issuer, gelesen: teil.length, redirect_uri: redirectUri() };
  } catch (e) {
    return { ok: false, grund: e.message, redirect_uri: redirectUri() };
  }
}

function fehlendeVariablen() {
  return ['PHALANX_OS_BASE_URL', 'PHALANX_OS_CLIENT_ID', 'PHALANX_OS_CLIENT_SECRET']
    .filter((k) => !process.env[k]);
}

/** Nur für Tests: gemerkte Discovery und Token vergessen. */
function cacheLeeren() { discoveryCache = null; jwksCache = null; tokenCache = null; }

module.exports = {
  eingerichtet, redirectUri, fehlendeVariablen, discovery,
  anmeldeStart, anmeldeAbschluss,
  poolToken, poolAufruf, kontakte, meldeKontakt, ping, cacheLeeren,
};
