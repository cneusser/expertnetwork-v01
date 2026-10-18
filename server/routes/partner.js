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

/**
 * v1.48.0 — Aus einem Kontakt einen assoziierten Partner machen.
 *
 * Der Gegenstück zu "Zu Kapitalpartner machen" aus v1.31.0, für den Fall,
 * der häufiger vorkommt: jemand mit eigenem Netzwerk, der Mandate mitbringt,
 * aber selbst keine Interim-Rolle sucht.
 *
 * Wie dort wird der Kontakt aus der Interim-Ansprache genommen, aber nicht
 * gelöscht. Wer einmal im Pool war, bleibt nachvollziehbar.
 */
router.post('/aus-experte/:expertId(\\d+)', async (req, res) => {
  const e = await db('experts').where({ id: Number(req.params.expertId), tenant_id: req.user.tenantId }).first();
  if (!e) return res.status(404).json({ error: 'Kontakt nicht gefunden' });

  const schon = await db('partner_applications')
    .where({ tenant_id: req.user.tenantId, expert_id: e.id }).first();
  if (schon) {
    return res.status(409).json({
      error: `${schon.vorname} ${schon.nachname} ist bereits als Partner angelegt.`,
    });
  }

  const [p] = await db('partner_applications').insert({
    tenant_id: req.user.tenantId,
    expert_id: e.id,
    vorname: e.vorname,
    nachname: e.nachname,
    // Die Tabelle verlangt eine Mailadresse. Fehlt sie, tragen wir das
    // ehrlich ein, statt etwas zu erfinden, das wie eine Adresse aussieht.
    email: e.email || `unbekannt+expert${e.id}@phalanx.invalid`,
    telefon: e.telefon || e.mobil || null,
    firma: e.firma || null,
    linkedin: e.linkedin || null,
    fokus_json: JSON.stringify(req.body?.fokus || []),
    nachricht: req.body?.notiz || null,
    status: 'in_pruefung',
    quelle: 'umgewandelt',
  }).returning('*');

  // Aus der Interim-Ansprache nehmen, ohne den Datensatz anzurühren.
  if (!e.vorreg_ausgeschlossen_am) {
    await db('experts').where({ id: e.id }).update({
      vorreg_ausgeschlossen_am: new Date(),
      vorreg_ausschluss_grund: 'Assoziierter Partner, keine Interim-Ansprache',
      zielgruppe: 'partner',
    });
  }

  await req.audit({
    action: 'partner.aus_experte', resource: 'partner_application', resourceId: p.id,
    newValue: { expert_id: e.id, name: `${p.vorname} ${p.nachname}` },
  });
  res.locals.auditLogged = true;

  res.status(201).json({
    ok: true, partner: p,
    message: `${p.vorname} ${p.nachname} ist jetzt assoziierter Partner und aus der Interim-Ansprache raus.`
      + (e.email ? '' : ' Bitte noch eine Mailadresse nachtragen.'),
  });
});

module.exports = router;
