const { verifyToken } = require('../utils/tokens');
const { db } = require('../db/knex');

/**
 * Liest das Session-Cookie und hängt req.user an.
 * v1.0.0: token_version-Abgleich — nach Passwortänderung/-reset oder Widerruf
 * sind ALLE älteren Sessions des Kontos sofort ungültig.
 */
async function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const payload = verifyToken(token);
    if (payload.tv !== undefined) {
      const row = await db('users').where({ id: payload.sub }).select('token_version').first();
      if (!row || (row.token_version || 0) !== payload.tv) {
        return res.status(401).json({ error: 'Sitzung abgelaufen — bitte neu anmelden' });
      }
    }
    req.user = {
      id: payload.sub,
      role: payload.role,
      tenantId: payload.tenantId,
      impersonatedBy: payload.impersonatedBy || null, // Birdview: Admin hinter der Experten-Sicht
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Sitzung abgelaufen' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht angemeldet' });
    // tenant_owner = Admin innerhalb des eigenen Mandanten (Sprint 8):
    // Alle 'admin'-Routen sind tenant-gefiltert und gelten daher auch für ihn.
    // Plattformweite Verwaltung (z. B. Mandanten anlegen) prüft explizit 'admin'.
    const expanded = roles.includes('admin') ? [...roles, 'tenant_owner'] : roles;
    if (!expanded.includes(req.user.role)) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
