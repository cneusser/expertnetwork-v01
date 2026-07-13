/**
 * v1.6.0 — "Sign in with LinkedIn" via OpenID Connect.
 * BEWUSST kein Scraping und kein Zugriff auf LinkedIn-Profildaten Dritter —
 * nur der offizielle OIDC-Flow (sub, name, email, picture) mit Einwilligung
 * des Nutzers auf der LinkedIn-Seite. (AGB-/DSGVO-Vorgabe des Projekts.)
 *
 * Einrichtung (LinkedIn Developer Portal):
 *   1. App anlegen → Produkt "Sign In with LinkedIn using OpenID Connect" hinzufügen
 *   2. Redirect-URL eintragen: https://<domain>/api/auth/linkedin/callback
 *   3. Railway-Variablen: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 *      (optional LINKEDIN_REDIRECT_URI, sonst automatisch aus APP_URL/Railway-Domain)
 */
const APP_URL = () =>
  process.env.APP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3001');

const enabled = () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
const redirectUri = () => process.env.LINKEDIN_REDIRECT_URI || `${APP_URL()}/api/auth/linkedin/callback`;

function authorizeUrl(state) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: 'openid profile email',
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

/** Code → Userinfo { sub, email, email_verified, name }. Im Test stubbar. */
async function fetchUserinfo(code) {
  if (process.env.NODE_ENV === 'test' && process.env.LINKEDIN_TEST_USERINFO) {
    return JSON.parse(process.env.LINKEDIN_TEST_USERINFO); // Teststub — kein Netz im CI
  }
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      redirect_uri: redirectUri(),
    }),
  });
  if (!tokenRes.ok) throw new Error(`LinkedIn-Token-Fehler (${tokenRes.status})`);
  const { access_token: accessToken } = await tokenRes.json();
  const infoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) throw new Error(`LinkedIn-Userinfo-Fehler (${infoRes.status})`);
  return infoRes.json();
}

module.exports = { enabled, authorizeUrl, fetchUserinfo, redirectUri };
