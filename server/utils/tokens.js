const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/** Session-Token (Login) — httpOnly-Cookie, 7 Tage. extra: z. B. { impersonatedBy } für Birdview. */
function signSession(user, extra = {}) {
  return jwt.sign(
    { sub: user.id, role: user.role, tenantId: user.tenant_id, ...extra },
    SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Zweckgebundene Einmal-Tokens (E-Mail-Verifizierung, Passwort-Reset,
 * ab Sprint 2: Ein-Klick-Verfügbarkeitsbestätigung).
 * "purpose" verhindert Token-Verwechslung zwischen Flows.
 */
function signPurposeToken(userId, purpose, expiresIn = '7d') {
  return jwt.sign({ sub: userId, purpose }, SECRET, { expiresIn });
}

function verifyToken(token, expectedPurpose = null) {
  const payload = jwt.verify(token, SECRET);
  if (expectedPurpose && payload.purpose !== expectedPurpose) {
    throw new Error('Token-Zweck ungültig');
  }
  return payload;
}

module.exports = { signSession, signPurposeToken, verifyToken };
