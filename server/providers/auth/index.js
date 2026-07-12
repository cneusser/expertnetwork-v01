/**
 * AuthProvider-Interface (VORBEREITET, in Sprint 0 bewusst NICHT implementiert).
 *
 * Zweck: Microsoft- und LinkedIn-OAuth später anschließen, ohne die Auth-Routen
 * umzubauen. Ein Provider liefert nach erfolgreichem OAuth-Callback ein
 * normalisiertes Profil; die Verknüpfung mit users übernimmt /api/auth.
 *
 * interface AuthProvider {
 *   name: string;                       // "microsoft" | "linkedin"
 *   getAuthUrl(state): string;          // Redirect-URL zum Provider
 *   handleCallback(code): Promise<{ email, displayName, providerUserId }>;
 * }
 *
 * Anbindung (später):
 * - Microsoft: MSAL / OAuth2, Env: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT
 * - LinkedIn:  OAuth2 "Sign In with LinkedIn", Env: LI_CLIENT_ID, LI_CLIENT_SECRET
 */
const providers = {}; // bewusst leer in Sprint 0

function getAuthProvider(name) {
  const p = providers[name];
  if (!p) throw new Error(`AuthProvider "${name}" nicht konfiguriert`);
  return p;
}

module.exports = { getAuthProvider, providers };
