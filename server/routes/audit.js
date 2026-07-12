/**
 * Sprint 4 — Globales Audit-Log (nur Admin).
 * Lesender Zugriff auf das append-only audit_log mit Filtern und CSV-Export.
 */
const express = require('express');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

function baseQuery(req) {
  let q = db('audit_log as a')
    .leftJoin('users as u', 'u.id', 'a.actor_id')
    .where('a.tenant_id', req.user.tenantId)
    .select('a.*', 'u.email as actor_email')
    .orderBy('a.ts', 'desc');
  if (req.query.resource) q = q.where('a.resource', req.query.resource);
  if (req.query.action) q = q.whereILike('a.action', `%${req.query.action}%`);
  if (req.query.from) q = q.where('a.ts', '>=', req.query.from);
  if (req.query.to) q = q.where('a.ts', '<=', `${req.query.to}T23:59:59Z`);
  return q;
}

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const rows = await baseQuery(req).limit(limit).offset(offset);
  res.json({ rows, limit, offset });
});

/** CSV-Export (gleiche Filter). */
router.get('/export.csv', async (req, res) => {
  const rows = await baseQuery(req).limit(10000);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'Zeitpunkt;Aktion;Ressource;Ressource-ID;Akteur;IP;Alt;Neu\n';
  const body = rows.map((r) =>
    [r.ts instanceof Date ? r.ts.toISOString() : r.ts, r.action, r.resource, r.resource_id,
      r.actor_email || 'System', r.ip, JSON.stringify(r.old_value_json), JSON.stringify(r.new_value_json)]
      .map(esc).join(';')
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send('﻿' + header + body);
});

module.exports = router;
