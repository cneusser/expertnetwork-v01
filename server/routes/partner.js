/** v1.11.0 — Assoziierte Partner: Triage der Anfragen (nur Admin). */
const express = require('express');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/bewerbungen', async (req, res) => {
  const rows = await db('partner_applications')
    .where({ tenant_id: req.user.tenantId })
    .orderBy('created_at', 'desc');
  res.json({ bewerbungen: rows });
});

router.post('/bewerbungen/:id(\\d+)/status', async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['neu', 'in_pruefung', 'angenommen', 'abgelehnt'].includes(status)) {
    return res.status(400).json({ error: 'Ungültiger Status' });
  }
  const row = await db('partner_applications').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!row) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  await db('partner_applications').where({ id: row.id }).update({ status });
  await req.audit({ action: 'partner.status', resource: 'partner_applications', resourceId: row.id, newValue: { status } });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

module.exports = router;
