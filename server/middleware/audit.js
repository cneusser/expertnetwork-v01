/**
 * AUDIT-PRINZIP (Sprint 0, Grundregel):
 * 1) auditContext-Middleware stellt req.audit() bereit — Routen loggen damit
 *    Detailänderungen (old/new) explizit.
 * 2) autoAudit loggt zusätzlich JEDE erfolgreiche mutierende Anfrage
 *    (POST/PUT/PATCH/DELETE) generisch, damit keine Route "vergessen" werden kann.
 * audit_log ist per DB-Trigger append-only.
 */
const { db } = require('../db/knex');

const DEFAULT_TENANT_ID = 1; // Default-Tenant "phalanx" (Seed legt ihn als id=1 an)

async function writeAudit({ tenantId, actorId, action, resource, resourceId, oldValue, newValue, ip }) {
  try {
    await db('audit_log').insert({
      tenant_id: tenantId || DEFAULT_TENANT_ID,
      actor_id: actorId || null,
      action,
      resource,
      resource_id: resourceId || null,
      old_value_json: oldValue ? JSON.stringify(oldValue) : null,
      new_value_json: newValue ? JSON.stringify(newValue) : null,
      ip: ip || null,
    });
  } catch (e) {
    // Audit darf die Fachlogik nicht brechen, aber Fehler müssen sichtbar sein.
    console.error('AUDIT-FEHLER:', e.message);
  }
}

function auditContext(req, _res, next) {
  req.audit = ({ action, resource, resourceId, oldValue, newValue }) =>
    writeAudit({
      tenantId: req.user?.tenantId,
      actorId: req.user?.id,
      action,
      resource,
      resourceId,
      oldValue,
      newValue,
      ip: req.ip,
    });
  next();
}

function autoAudit(req, res, next) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!mutating) return next();
  res.on('finish', () => {
    if (res.statusCode < 400 && !res.locals.auditLogged) {
      writeAudit({
        tenantId: req.user?.tenantId,
        actorId: req.user?.id,
        action: `${req.method.toLowerCase()} ${req.baseUrl}${req.route?.path || req.path}`,
        resource: 'http',
        ip: req.ip,
      });
    }
  });
  next();
}

module.exports = { auditContext, autoAudit, writeAudit };
