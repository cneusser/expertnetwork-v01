const { verifyToken } = require('../utils/tokens');

/** Liest das Session-Cookie und hängt req.user an. */
function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role, tenantId: payload.tenantId };
    next();
  } catch {
    return res.status(401).json({ error: 'Sitzung abgelaufen' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
